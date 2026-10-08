import { generateObject } from 'ai'
import { z } from 'zod'
import {
  sectionSchema,
  websiteEditSchema,
  websiteSchema,
  type Section,
  type WebsiteSchema,
} from '@/lib/website-schema'
import { applyOperation } from '@/lib/website-edit-operations'
import { parseCommand } from '@/lib/website-command-parser'
import { preserveResolvedImages } from '@/lib/hero-image'
import { createClient } from '@/lib/supabase/server'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance } from '@/lib/ai-credits'
import { getPlanCodeForUser } from '@/lib/billing'
import {
  PAGE_LIMIT_ERROR,
  isPageGrowthBlocked,
  pageLimitForPlan,
  pageLimitMessage,
} from '@/lib/page-limits'
import { toPlanCode } from '@/lib/pricing-config'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'

/**
 * Deterministic fallback: try to satisfy the instruction with the offline
 * command parser. Returns the updated schema (source 'command') or null if the
 * parser can't confidently handle the instruction.
 */
function tryCommandParser(original: WebsiteSchema, instruction: string) {
  const parsed = parseCommand(instruction, original)
  if (!parsed || parsed.operations.length === 0) return null
  const next = parsed.operations.reduce((acc, op) => applyOperation(acc, op), original)
  const valid = websiteSchema.safeParse(next)
  return valid.success ? valid.data : null
}

/**
 * Removes resolved image payloads before the schema is shown to the model.
 *
 * A generated hero image can be a multi-hundred-KB `data:` URI. Sending it into
 * the prompt burns the context window and frequently made the model echo back a
 * truncated (or omitted) `src` — the real reason the hero image vanished after
 * an unrelated edit. We strip them here and restore them afterwards with
 * `preserveResolvedImages`, so the model reasons over text only and the images
 * are guaranteed to survive.
 */
function scrubImageSrc(obj: unknown): void {
  if (Array.isArray(obj)) {
    obj.forEach(scrubImageSrc)
    return
  }
  if (!obj || typeof obj !== 'object') return
  const record = obj as Record<string, unknown>
  if (typeof record.src === 'string') delete record.src
  Object.values(record).forEach(scrubImageSrc)
}

function stripImagePayloads(site: WebsiteSchema): WebsiteSchema {
  const copy: WebsiteSchema = JSON.parse(JSON.stringify(site))
  scrubImageSrc(copy.sections)
  return copy
}

/** Same stripping, scoped to a single section (used for `scope`-limited edits). */
function stripSectionImagePayload(section: Section): Section {
  const copy: Section = JSON.parse(JSON.stringify(section))
  scrubImageSrc(copy)
  return copy
}

export const maxDuration = 30

/** Builds the scoped system prompt for a single-section edit. */
function sectionSystemPrompt(normalizedLang: 'tr' | 'en', language: string): string {
  return (
    `You are GLOVAL AI, a professional web designer editing ONE SECTION of an EXISTING website. ` +
    `You are given the current section as a JSON object that conforms to a strict discriminated-union schema ` +
    `(the "type" field is fixed and must NOT change), plus a user instruction describing a change to make to ` +
    `THIS SECTION ONLY. Apply the requested change and return the COMPLETE, updated section JSON — never a ` +
    `partial patch, and never a different section type. ` +
    `Make TARGETED edits: change only what the instruction asks for and keep everything else in this section ` +
    `identical unless the instruction clearly requires otherwise. ` +
    `CRITICAL: copy every existing image "src" value through UNCHANGED, exactly as given, ` +
    `including long data: URIs and https URLs. Never blank, shorten, truncate or invent an image "src". ` +
    `If the user asks for a different image, only rewrite its "imagePrompt" and leave "src" as-is. ` +
    `Write any new human-readable text in ${language} (site language is "${normalizedLang}"). ` +
    `To hide this section rather than delete it, set its "hidden" field to true (and false to show it again). ` +
    `Use valid hex colors, real Google Font names, and lowercase lucide-react icon names. ` +
    `Do NOT output HTML, React, CSS or code of any kind — only the structured section JSON.`
  )
}

/** Builds the full-site system prompt for a whole-website edit. */
function siteSystemPrompt(normalizedLang: 'tr' | 'en', language: string): string {
  return (
    `You are GLOVAL AI, a professional web designer editing an EXISTING website. ` +
    `You are given the current website as a JSON object that conforms to a strict schema, ` +
    `plus a user instruction describing a change. ` +
    `Apply the requested change and return the COMPLETE, updated website JSON — never a partial patch. ` +
    `Make TARGETED edits: change only what the instruction asks for and keep everything else identical ` +
    `(same section order, same content, same ids) unless the instruction clearly requires otherwise. ` +
    `Never remove meta.name, meta.tagline, theme, theme.palette, navigation, sections, or the footer ` +
    `unless the user explicitly asks to remove them. ` +
    `CRITICAL: copy every existing image "src" value through UNCHANGED, exactly as given, ` +
    `including long data: URIs and https URLs. Never blank, shorten, truncate or invent an image "src". ` +
    `If the user asks for a different image, only rewrite its "imagePrompt" and leave "src" as-is. ` +
    `Keep meta.language as "${normalizedLang}" and write any new human-readable text in ${language}. ` +
    `When adding a section, pick the most fitting type from: hero, about, services, features, stats, ` +
    `testimonials, gallery, portfolio, process, team, pricing, faq, contact, cta, footer. ` +
    `To hide a section rather than delete it, set its "hidden" field to true (and false to show it again). ` +
    `"contactActions" controls the floating phone + WhatsApp buttons pinned to every page. ` +
    `To change a number, set contactActions.phone or contactActions.whatsapp. ` +
    `To remove ONE button, set that field to an empty string. ` +
    `To remove BOTH buttons, set contactActions.enabled to false (and true to bring them back). ` +
    `Never invent a phone number: only use a number the user gives you or one already in the site. ` +
    `To reorder sections, change their order in the sections array. ` +
    `The header menu is built from "pages" (titles) when there is more than one page, otherwise from ` +
    `"navigation.links". To remove ONE menu item, delete only that entry from "pages" (never the home page) ` +
    `and/or from "navigation.links" (keep at least one link) and DO NOT delete or hide any section. ` +
    `Use valid hex colors, real Google Font names, and lowercase lucide-react icon names. ` +
    `Do NOT output HTML, React, CSS or code of any kind — only the structured website JSON.`
  )
}

/**
 * POST /api/edit
 * --------------
 * Conversational website editor. Receives the CURRENT WebsiteSchema plus a
 * natural-language instruction and returns the COMPLETE updated schema.
 *
 * Contract:
 *   Request:  { schema: WebsiteSchema, instruction: string, lang: 'tr' | 'en', scope?: { sectionIndex: number } }
 *   Response: { schema: WebsiteSchema, source: 'ai' | 'fallback' | 'command' }
 *
 * When `scope.sectionIndex` is given, the model only ever sees and returns
 * ONE section (via the discriminated-union `sectionSchema`) — the rest of the
 * site is spliced back in unchanged by this route, not by prompt instruction,
 * so the model cannot touch unrelated sections, navigation or meta even if it
 * tried.
 *
 * Safety principles:
 *  - The AI only ever returns structured schema JSON — never code.
 *  - The result is validated with Zod. If it fails, the ORIGINAL schema is
 *    returned unchanged (source: 'fallback') so an edit can never destroy the
 *    existing website.
 *  - If the AI Gateway is unavailable, the original schema is returned as-is.
 *  - Every request must belong to a signed-in user (401) with enough AI
 *    credits (402) before the AI Gateway is ever called; a credit is only
 *    actually spent once the AI successfully produces a result.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    schema?: unknown
    instruction?: string
    lang?: 'tr' | 'en'
    scope?: { sectionIndex?: number }
  }

  const { instruction } = body
  const normalizedLang: 'tr' | 'en' = body.lang === 'en' ? 'en' : 'tr'
  const language = normalizedLang === 'en' ? 'English' : 'Turkish'

  // The incoming schema must itself be valid before we try to edit it.
  const current = websiteSchema.safeParse(body.schema)
  if (!current.success) {
    return Response.json({ error: 'Invalid schema' }, { status: 400 })
  }
  if (!instruction || instruction.trim().length < 2) {
    return Response.json({ error: 'Instruction too short' }, { status: 400 })
  }

  const original: WebsiteSchema = current.data

  const sectionIndex = body.scope?.sectionIndex
  const hasValidScope =
    typeof sectionIndex === 'number' &&
    Number.isInteger(sectionIndex) &&
    sectionIndex >= 0 &&
    sectionIndex < original.sections.length

  const supabase = await createClient()
  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = userData.user.id

  // FREE-plan daily action gate — independent from and checked BEFORE the AI
  // credit balance below. See lib/free-daily-limit.ts.
  const planCode = toPlanCode(await getPlanCodeForUser(userId))
  const dailyLimit = await checkFreeDailyActionLimit(userId, planCode)
  if (!dailyLimit.allowed) {
    return Response.json(freeDailyLimitResponseBody(dailyLimit), { status: 429 })
  }

  // A plan's page limit only blocks GROWTH: edits that keep or reduce the page
  // count always pass, even on a site that is already over the limit.
  const pageLimit = pageLimitForPlan(planCode)
  const pageLimitResponse = (next: WebsiteSchema): Response | null => {
    if (!isPageGrowthBlocked(original.pages.length, next.pages.length, pageLimit)) return null
    return Response.json(
      {
        error: PAGE_LIMIT_ERROR,
        message: pageLimitMessage(normalizedLang, pageLimit, original.pages.length),
        limit: pageLimit,
        current: original.pages.length,
      },
      { status: 403 },
    )
  }

  const cost = AI_ACTION_COSTS.edit
  const balance = await getCreditBalance(userId)
  if (balance < cost) {
    return Response.json({ error: 'Out of credits', balance }, { status: 402 })
  }

  try {
    let aiSection: Section | null = null
    let aiSite: WebsiteSchema | null = null

    if (hasValidScope) {
      const targetSection = original.sections[sectionIndex]
      // `sectionSchema` is a discriminated union, which compiles to a top-level
      // `anyOf` JSON Schema. OpenAI structured outputs reject that at the root
      // ("schema must be of type object"), so the model call always threw and
      // silently fell back to the scope-blind command parser. Wrapping the union
      // in an object property keeps the root an object while still constraining
      // the value to a valid section.
      const { object } = await generateObject({
        model: 'openai/gpt-5-mini',
        schema: z.object({ section: sectionSchema }),
        providerOptions: { openai: { strictJsonSchema: false } },
        system: sectionSystemPrompt(normalizedLang, language),
        prompt:
          `CURRENT SECTION (JSON):\n${JSON.stringify(stripSectionImagePayload(targetSection))}\n\n` +
          `USER INSTRUCTION:\n${instruction.slice(0, 600)}\n\n` +
          `Return the full updated section JSON now, as {"section": <the updated section>}.`,
      })
      const validatedSection = sectionSchema.safeParse(object.section)
      if (validatedSection.success && validatedSection.data.type === targetSection.type) {
        aiSection = validatedSection.data
      }
    } else {
      const { object } = await generateObject({
        model: 'openai/gpt-5-mini',
        // Owner-authored fields (custom code snippets, SEO title) are excluded
        // from the model's schema so an unrelated edit can never rewrite or drop
        // them; they are merged back from the current schema below.
        schema: websiteEditSchema,
        // The website schema has optional fields (e.g. navigation.cta). In ai@7
        // strictJsonSchema defaults to true, which makes OpenAI reject schemas
        // whose optional keys aren't in `required` (400). Relax strict mode so
        // the AI edit path actually runs instead of always falling back.
        providerOptions: { openai: { strictJsonSchema: false } },
        system: siteSystemPrompt(normalizedLang, language),
        prompt:
          `CURRENT WEBSITE (JSON):\n${JSON.stringify(stripImagePayloads(original))}\n\n` +
          `USER INSTRUCTION:\n${instruction.slice(0, 600)}\n\n` +
          `Return the full updated website JSON now.`,
      })
      // generateObject already validates against websiteSchema, but re-parse
      // defensively so a malformed result can never reach the client.
      const validated = websiteSchema.safeParse(object)
      if (validated.success) aiSite = validated.data
    }

    if (!aiSection && !aiSite) {
      // The whole-site command parser is NOT scope-aware, so it must never run
      // for a scoped edit — otherwise it would edit the wrong element (e.g. the
      // hero) and mislabel it as an AI suggestion. Scoped failures return the
      // site unchanged instead.
      if (!hasValidScope) {
        console.log('[v0] edit validation failed, trying command parser')
        const command = tryCommandParser(original, instruction)
        if (command) {
          const blocked = pageLimitResponse(command)
          if (blocked) return blocked
          return Response.json({ schema: command, source: 'command' })
        }
      }
      return Response.json({ schema: original, source: 'fallback' })
    }

    // Restore any image `src` the model dropped, so an unrelated text edit can
    // never make the hero/slider image disappear, and carry the owner's custom
    // code + SEO title through untouched.
    const nextSite: WebsiteSchema = aiSection
      ? {
          ...original,
          sections: original.sections.map((s, i) => (i === sectionIndex ? aiSection! : s)),
        }
      : aiSite!
    const restored: WebsiteSchema = {
      ...nextSite,
      meta: { ...nextSite.meta, seoTitle: original.meta.seoTitle },
      // The brand mark is owner-managed (generated locally or uploaded), so it
      // is carried through untouched by any AI edit.
      navigation: { ...nextSite.navigation, logo: original.navigation.logo },
      // The model MAY intentionally edit the floating call buttons, so its value
      // wins when present — but an unrelated edit that simply omits the key must
      // not silently delete the owner's phone/WhatsApp settings.
      contactActions: nextSite.contactActions ?? original.contactActions,
      tracking: original.tracking,
    }
    const finalSchema = preserveResolvedImages(original, restored)

    // The model sometimes answers "done" while returning the site untouched.
    // That must surface as a failure (and cost nothing), never as a success.
    if (JSON.stringify(finalSchema) === JSON.stringify(original)) {
      console.log('[v0] edit produced no change, reporting fallback')
      return Response.json({ schema: original, source: 'fallback' })
    }

    // Refuse before charging: a result that adds pages past the plan limit costs nothing.
    const blockedByPageLimit = pageLimitResponse(finalSchema)
    if (blockedByPageLimit) return blockedByPageLimit

    // Only spend a credit once the AI has actually produced a usable result.
    // consumeCredits is an atomic RPC, so a race with a concurrent request
    // from the same user can never push the balance negative; if it reports
    // insufficient funds here (lost the race against another request made
    // between the pre-check above and now), discard the AI result and 402.
    const charge = await consumeCredits(userId, cost, `edit:${instruction.slice(0, 80)}`)
    if (!charge.ok) {
      return Response.json({ error: 'Out of credits', balance: charge.balance }, { status: 402 })
    }

    return Response.json({ schema: finalSchema, source: 'ai' })
  } catch (err) {
    // AI Gateway unavailable or generation failed. Fall back to the offline
    // deterministic command parser so common edits still work; never destroy
    // the site. No credit is spent on this path.
    console.log('[v0] edit error, trying command parser:', err instanceof Error ? err.message : err)
    // Scoped edits must never fall back to the scope-blind whole-site parser.
    if (!hasValidScope) {
      const command = tryCommandParser(original, instruction)
      if (command) {
        const blocked = pageLimitResponse(command)
        if (blocked) return blocked
        return Response.json({ schema: command, source: 'command' })
      }
    }
    return Response.json({ schema: original, source: 'fallback' })
  }
}
