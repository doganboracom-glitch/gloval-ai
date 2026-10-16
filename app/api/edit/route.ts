import { z } from 'zod'
import { generateStructured } from '@/lib/ai-structured'
import { siteRepairOptions } from '@/lib/site-repair'
import {
  sectionSchema,
  websiteEditSchema,
  websiteSchema,
  type Section,
  type WebsiteSchema,
} from '@/lib/website-schema'
import { applyOperation } from '@/lib/website-edit-operations'
import { sectionSystemPrompt, sectionUserPrompt, siteSystemPrompt } from '@/lib/site-edit-prompts'
import { parseCommand } from '@/lib/website-command-parser'
import { parseBlogInstruction } from '@/lib/blog-operations'
import { classifyEditInstruction } from '@/lib/edit-intent-gates'
import { isOverBroadEdit, summarizeSiteChanges } from '@/lib/site-change-summary'
import {
  PRODUCTS_MANAGED_IN_PANEL,
  isBlockedProductOperation,
  lockStorefrontProducts,
} from '@/lib/storefront-product-lock'
import { preserveResolvedImages } from '@/lib/hero-image'
import { createClient } from '@/lib/supabase/server'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance } from '@/lib/ai-credits'
import { getPlanCodeForUser } from '@/lib/billing'
import { logAiUsage, resolveAiModel } from '@/lib/ai-models'
import {
  PAGE_LIMIT_ERROR,
  isPageGrowthBlocked,
  pageLimitForPlan,
  pageLimitMessage,
} from '@/lib/page-limits'
import { toPlanCode } from '@/lib/pricing-config'
import { enforceSocialPlan } from '@/lib/social-links'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'
import { sanitizeGeneratedProofContent } from '@/lib/proof-content'

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
  if (!valid.success) return null
  // Product edits on a storefront are refused by applyOperation; an untouched
  // result must not be reported as a successful command.
  if (JSON.stringify(valid.data) === JSON.stringify(original)) return null
  return valid.data
}

/** True when the offline parser only wanted to edit a storefront's catalog. */
function parserWantedProductEdit(original: WebsiteSchema, instruction: string): boolean {
  const parsed = parseCommand(instruction, original)
  return !!parsed?.operations.some((op) => isBlockedProductOperation(original, op))
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

  // Blog instructions are only RECOGNISED here. Posts live in their own table,
  // so the client executes them via /api/blog/operation (confirmation, gates and
  // the 3-credit rule live there). Nothing is charged or changed by this branch.
  const blogOperation = parseBlogInstruction(instruction)
  if (blogOperation && !hasValidScope) {
    return Response.json({ schema: original, source: 'blog', blogOperation })
  }

  // Requests the schema cannot express (login system, hosting, integrations),
  // the automatic Blog menu link and one-word "make it nicer" instructions are
  // answered honestly here: no AI call, no credit, nothing changed.
  const gate = classifyEditInstruction(instruction, normalizedLang, { scoped: hasValidScope })
  if (gate) {
    return Response.json({ schema: original, source: 'declined', reason: gate.kind, message: gate.message })
  }

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

  // Tier comes from the plan looked up above on the server, never from the request.
  const ai = resolveAiModel(hasValidScope ? 'sectionEdit' : 'siteEdit', planCode)

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
      const { object } = await generateStructured({
        ai,
        schema: z.object({ section: sectionSchema }),
        system: sectionSystemPrompt(normalizedLang, language),
        prompt: sectionUserPrompt(stripSectionImagePayload(targetSection), instruction),
      })
      const validatedSection = sectionSchema.safeParse(object.section)
      if (validatedSection.success && validatedSection.data.type === targetSection.type) {
        aiSection = validatedSection.data
      }
    } else {
      const { object } = await generateStructured({
        ai,
        // Owner-authored fields (custom code snippets, SEO title) are excluded
        // from the model's schema so an unrelated edit can never rewrite or drop
        // them; they are merged back from the current schema below.
        schema: websiteEditSchema,
        system: siteSystemPrompt(normalizedLang, language),
        prompt:
          `CURRENT WEBSITE (JSON):\n${JSON.stringify(stripImagePayloads(original))}\n\n` +
          `USER INSTRUCTION:\n${instruction.slice(0, 600)}\n\n` +
          `Return the full updated website JSON now.`,
        // An edit must never silently delete the owner's sections, so surplus
        // sections are not trimmed here: such an answer is retried once and
        // otherwise leaves the site unchanged.
        repair: siteRepairOptions({ lang: normalizedLang, siteName: original.meta.name, trimSections: false }),
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
      return Response.json({
        schema: original,
        source: 'fallback',
        notice: parserWantedProductEdit(original, instruction) ? PRODUCTS_MANAGED_IN_PANEL : undefined,
      })
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
    const restoredBase: WebsiteSchema = {
      ...nextSite,
      meta: { ...nextSite.meta, seoTitle: original.meta.seoTitle },
      // The brand mark is owner-managed (generated locally or uploaded), so it
      // is carried through untouched by any AI edit.
      navigation: { ...nextSite.navigation, logo: original.navigation.logo },
      // The model MAY intentionally edit the floating call buttons, so its value
      // wins when present — but an unrelated edit that simply omits the key must
      // not silently delete the owner's phone/WhatsApp settings.
      contactActions: nextSite.contactActions ?? original.contactActions,
      // Same rule for social links, but the model's value is sanitized and then
      // gated by the plan below.
      social: nextSite.social ?? original.social,
      tracking: original.tracking,
      // Legal identity and legal texts are owner-only: the AI never sees or edits them.
      company: original.company,
      blogProfile: original.blogProfile,
      legalDocs: original.legalDocs,
    }
    // Social links are a paid feature: on FREE whatever the model wrote is
    // discarded and the stored value kept; elsewhere it is validated/normalized.
    const restored = enforceSocialPlan(restoredBase, original, planCode)
    // A storefront's catalog lives in the database: any product data the model
    // wrote into the schema is discarded and the user is pointed to the panel.
    const locked = lockStorefrontProducts(original, restored)
    const notice = locked.touched ? PRODUCTS_MANAGED_IN_PANEL : undefined
    const finalSchema = sanitizeGeneratedProofContent(preserveResolvedImages(original, locked.schema), original)

    // The model sometimes answers "done" while returning the site untouched.
    // That must surface as a failure (and cost nothing), never as a success.
    if (JSON.stringify(finalSchema) === JSON.stringify(original)) {
      console.log('[v0] edit produced no change, reporting fallback')
      return Response.json({ schema: original, source: 'fallback', notice })
    }

    // A focused instruction must not rewrite half the site: such a result is
    // discarded (nothing charged) instead of being offered for approval.
    const changeSummary = summarizeSiteChanges(original, finalSchema, normalizedLang)
    if (isOverBroadEdit(changeSummary, instruction)) {
      console.log('[v0] edit touched too many sections, declining', changeSummary.sectionsTouched)
      return Response.json({
        schema: original,
        source: 'declined',
        reason: 'too-broad',
        message:
          normalizedLang === 'tr'
            ? `Bu istek ${changeSummary.sectionsTouched} bölümü birden değiştirecekti; istediğinden fazlasını değiştirmemek için hiçbir şey uygulamadım. Lütfen tek bir bölümü veya öğeyi belirterek yeniden dene.`
            : `This request would have changed ${changeSummary.sectionsTouched} sections at once; to avoid changing more than you asked for I applied nothing. Please try again naming a single section or element.`,
      })
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

    return Response.json({ schema: finalSchema, source: 'ai', notice, changes: changeSummary.lines })
  } catch (err) {
    // AI Gateway unavailable or generation failed. Fall back to the offline
    // deterministic command parser so common edits still work; never destroy
    // the site. No credit is spent on this path.
    console.info('[ai-fallback]', { flow: ai.flow, model: ai.model, reason: err instanceof Error ? err.name : 'unknown' })
    // Scoped edits must never fall back to the scope-blind whole-site parser.
    if (!hasValidScope) {
      const command = tryCommandParser(original, instruction)
      if (command) {
        const blocked = pageLimitResponse(command)
        if (blocked) return blocked
        return Response.json({ schema: command, source: 'command' })
      }
    }
    return Response.json({
      schema: original,
      source: 'fallback',
      notice:
        !hasValidScope && parserWantedProductEdit(original, instruction)
          ? PRODUCTS_MANAGED_IN_PANEL
          : undefined,
    })
  }
}
