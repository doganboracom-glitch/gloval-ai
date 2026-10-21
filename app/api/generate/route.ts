import { z } from 'zod'
import { fallbackWebsite } from '@/lib/website-schema'
import { generateSiteObject } from '@/lib/site-generate'
import { generateStructured } from '@/lib/ai-structured'
import { resolveGenerationLanguage } from '@/lib/generation-language'
import { seedContactActions } from '@/lib/site-contact-actions'
import { seedFooterColumns, seedFooterLegal } from '@/lib/footer-links'
import { ensureContactSection, flagPlaceholderContact } from '@/lib/contact-section'
import { ensureStoreAboutSection } from '@/lib/about-section'
import { seedAboutMedia } from '@/lib/about-media'
import { attachAboutImage } from '@/lib/about-image'
import { seedAboutDetail, syncDetailPages } from '@/lib/section-detail'
import { generateAboutDetail } from '@/lib/about-detail-ai'
import { normalizeCorporateSectionOrder, withBlogOffByDefault } from '@/lib/section-order'
import { deriveSeoTitle, detectSector } from '@/lib/sector-profiles'
import { buildSiteGenerateSystem } from '@/lib/site-generate-prompt'
import { attachHeroImage } from '@/lib/hero-image'
import { attachSectionImages } from '@/lib/section-images'
import { createClient } from '@/lib/supabase/server'
import { getPlanCodeForUser } from '@/lib/billing'
import { logAiUsage, resolveAiModel } from '@/lib/ai-models'
import { capPagesToLimit, pageLimitForPlan } from '@/lib/page-limits'
import {
  ANON_AI_LIMIT_ERROR,
  releaseAnonAiActions,
  reserveAnonAiAction,
} from '@/lib/anon-ai-limit'

// Image generation runs the hero and section images CONCURRENTLY (see below),
// each hard-capped at 25s inside the provider. Even so, text generation plus a
// slow image provider was observed to exceed 60s and get the function killed
// (the browser then shows "Bir şeyler ters gitti"). A larger budget guarantees
// the route returns a valid site — images that don't finish keep their
// prompt-only gradient fallback.
export const maxDuration = 300

const planSchema = z.object({
  siteName: z.string().describe('A short, catchy name for the website'),
  tagline: z.string().describe('A one-line tagline / hero headline'),
  tone: z.string().describe('Two or three words describing the visual tone'),
  audience: z.string().describe('Who the site is for, in a few words'),
  palette: z
    .array(
      z.object({
        name: z.string(),
        hex: z.string().describe('A hex color like #6d28d9'),
      }),
    )
    .min(3)
    .max(5)
    .describe('A cohesive color palette of 3-5 colors'),
  pages: z.array(z.string()).min(2).max(6).describe('Suggested pages'),
  sections: z
    .array(z.object({ title: z.string(), description: z.string() }))
    .min(3)
    .max(6)
    .describe('Homepage sections with a short description each'),
})

function fallbackPlan(prompt: string, lang: 'tr' | 'en') {
  const idea = prompt.trim().replace(/\s+/g, ' ').slice(0, 60)
  const tr = {
    tagline: `${idea} için modern ve akılda kalıcı bir web deneyimi`,
    tone: 'Modern, güven veren, sade',
    audience: 'Markanı keşfeden yeni ziyaretçiler',
    pages: ['Ana Sayfa', 'Hakkımızda', 'Hizmetler', 'İletişim'],
    sections: [
      { title: 'Kahraman Bölümü', description: 'Net bir başlık, kısa açıklama ve birincil eylem çağrısı.' },
      { title: 'Öne Çıkanlar', description: 'Fikri güçlü kılan üç ana değer önermesi.' },
      { title: 'Sosyal Kanıt', description: 'Referanslar veya güven veren rakamlar.' },
      { title: 'Kapanış CTA', description: 'Ziyaretçiyi harekete geçiren son çağrı.' },
    ],
  }
  const en = {
    tagline: `A modern, memorable web experience for ${idea}`,
    tone: 'Modern, trustworthy, clean',
    audience: 'New visitors discovering your brand',
    pages: ['Home', 'About', 'Services', 'Contact'],
    sections: [
      { title: 'Hero', description: 'A clear headline, short subtext and a primary call to action.' },
      { title: 'Highlights', description: 'Three key value propositions that make the idea strong.' },
      { title: 'Social proof', description: 'Testimonials or trust-building numbers.' },
      { title: 'Closing CTA', description: 'A final call that moves the visitor to act.' },
    ],
  }
  const copy = lang === 'en' ? en : tr
  return {
    siteName: idea.split(' ').slice(0, 2).join(' ') || 'gloval.ai',
    palette: [
      { name: 'Primary', hex: '#7c3aed' },
      { name: 'Accent', hex: '#22d3ee' },
      { name: 'Ink', hex: '#0f172a' },
      { name: 'Surface', hex: '#f8fafc' },
    ],
    ...copy,
  }
}

type GenerateBody = {
  prompt?: string
  lang?: 'tr' | 'en'
  mode?: 'plan' | 'website'
}

/**
 * Anonymous callers are limited server-side (see lib/anon-ai-limit.ts): a slot
 * is reserved atomically before the model runs and released again unless the
 * run genuinely completed with the AI (`source: 'ai'`). Signed-in users skip
 * this counter entirely — their FREE 7/24h rule is enforced elsewhere.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as GenerateBody

  if (!body.prompt || body.prompt.trim().length < 3) {
    return Response.json({ error: 'Prompt too short' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (userData?.user) {
    // Resolved on the server per request: the client never says which plan it is on.
    const planCode = await getPlanCodeForUser(userData.user.id)
    return runGenerate(body, pageLimitForPlan(planCode), planCode)
  }

  const pageLimit = pageLimitForPlan(null)
  const reservation = await reserveAnonAiAction(req)
  if (!reservation.allowed) {
    return Response.json(
      {
        error: ANON_AI_LIMIT_ERROR,
        limit: reservation.limit,
        resetAt: reservation.resetAt,
      },
      { status: 429 },
    )
  }

  let counted = false
  try {
    const res = await runGenerate(body, pageLimit, null)
    if (res.ok) {
      const data = (await res.clone().json().catch(() => null)) as { source?: string } | null
      counted = data?.source === 'ai'
    }
    return res
  } finally {
    if (!counted) await releaseAnonAiActions(reservation.subjects)
  }
}

async function runGenerate(
  { prompt, lang, mode }: GenerateBody,
  pageLimit: number,
  planCode: string | null,
) {
  if (!prompt) return Response.json({ error: 'Prompt too short' }, { status: 400 })

  // The brief decides the site language; the UI language only breaks ties.
  const normalizedLang: 'tr' | 'en' = resolveGenerationLanguage(prompt, lang)
  const language = normalizedLang === 'en' ? 'English' : 'Turkish'

  /* ---- Website mode: produce a full structured WebsiteSchema ---- */
  if (mode === 'website') {
    const ai = resolveAiModel('siteGenerate', planCode)
    try {
      // Model call + deterministic repair + at most one same-model retry +
      // page cap + SEO title all live in `generateSiteObject`, shared with the
      // comparison script. It logs usage/repair itself and throws once the AI
      // path is exhausted, which lands in the fallback below.
      const { site: object } = await generateSiteObject({
        ai,
        prompt,
        lang: normalizedLang,
        pageLimit,
      })

      // Attach a dynamic, brief-derived hero/slider image AND every other
      // visual (gallery / portfolio / team) — concurrently. They mutate
      // disjoint sections, so running them in parallel (instead of hero-then-
      // sections) roughly halves the image latency and keeps the whole request
      // comfortably within budget. Both are best-effort: a missing `src` falls
      // back to the gradient placeholder.
      const [img, sectionImages] = await Promise.all([
        attachHeroImage(object, prompt),
        attachSectionImages(object, prompt),
      ])

      // About image: reuse is free (seedAboutMedia); only when the site has no
      // reusable image does the existing image pipeline run once. No extra
      // credits are charged and a failure leaves the text-only layout.
      const seededAbout = await attachAboutImage(
        seedAboutMedia(flagPlaceholderContact(withBlogOffByDefault(normalizeCorporateSectionOrder(ensureStoreAboutSection(ensureContactSection(object)))), prompt), prompt),
        prompt,
      )
      // Long-form About body written only from the site's own facts; any
      // failure falls back to the deterministic starter inside the helper.
      const aboutDetail = await generateAboutDetail(seededAbout, planCode)

      return Response.json({
        // Seeds the floating phone + WhatsApp buttons from the site's own
        // contact section, so every new site ships them without the model
        // being able to invent a phone number.
        website: seedFooterLegal(
          seedFooterColumns(
            seedContactActions(syncDetailPages(seedAboutDetail(seededAbout, aboutDetail), pageLimit)),
            normalizedLang,
          ),
          normalizedLang,
        ),
        source: 'ai',
        sectionImages,
        image: {
          sector: img.brief.sector,
          available: img.available,
          generated: img.generated,
          // 'completed' -> real image; 'failed' -> provider on but no image;
          // 'skipped'   -> no provider configured (prompt-only fallback).
          status: img.available ? (img.generated ? 'completed' : 'failed') : 'skipped',
        },
      })
    } catch (err) {
      // AI Gateway may be unavailable (e.g. no billing configured). Fall back to
      // a deterministic website so the pipeline still produces valid schema.
      console.info('[ai-fallback]', { flow: ai.flow, model: ai.model, reason: err instanceof Error ? err.name : 'unknown' })
      const website = capPagesToLimit(fallbackWebsite(prompt, normalizedLang), pageLimit)
      const [img, sectionImages] = await Promise.all([
        attachHeroImage(website, prompt),
        attachSectionImages(website, prompt),
      ])
      const seededAbout = await attachAboutImage(
        seedAboutMedia(flagPlaceholderContact(withBlogOffByDefault(normalizeCorporateSectionOrder(ensureStoreAboutSection(ensureContactSection(website)))), prompt), prompt),
        prompt,
      )
      return Response.json({
        website: seedFooterLegal(
          seedFooterColumns(
            seedContactActions(syncDetailPages(seedAboutDetail(seededAbout))),
            normalizedLang,
          ),
          normalizedLang,
        ),
        source: 'fallback',
        sectionImages,
        image: {
          sector: img.brief.sector,
          available: img.available,
          generated: img.generated,
          status: img.available ? (img.generated ? 'completed' : 'failed') : 'skipped',
        },
      })
    }
  }

  /* ---- Plan mode (default): unchanged, powers the landing hero ---- */
  const planAi = resolveAiModel('sitePlan', planCode)
  try {
    const { object } = await generateStructured({
      ai: planAi,
      schema: planSchema,
      system:
        `You are GLOVAL AI (gloval.ai), an AI website builder. Given a user's description of the website they want, ` +
        `produce a concise, tasteful website plan. Respond with all human-readable text written in ${language}. ` +
        `Keep hex colors valid and the palette cohesive and modern. Be specific to the user's idea, not generic.`,
      prompt: prompt.slice(0, 600),
    })
    return Response.json({ plan: object, source: 'ai' })
  } catch (err) {
    // AI Gateway may be unavailable (e.g. no billing configured). Fall back to a
    // deterministic plan so the demo still works, and flag it for the client.
    console.info('[ai-fallback]', { flow: planAi.flow, model: planAi.model, reason: err instanceof Error ? err.name : 'unknown' })
    return Response.json({
      plan: fallbackPlan(prompt, normalizedLang),
      source: 'fallback',
    })
  }
}
