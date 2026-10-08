import { generateObject } from 'ai'
import { z } from 'zod'
import { websiteGenerationSchema, fallbackWebsite } from '@/lib/website-schema'
import { seedContactActions } from '@/lib/site-contact-actions'
import { normalizeCorporateSectionOrder } from '@/lib/section-order'
import { sectorPromptHint, deriveSeoTitle, detectSector, isEcommerceIntent } from '@/lib/sector-profiles'
import { attachHeroImage } from '@/lib/hero-image'
import { attachSectionImages } from '@/lib/section-images'
import { createClient } from '@/lib/supabase/server'
import { getPlanCodeForUser } from '@/lib/billing'
import { capPagesToLimit, pageLimitForPlan, pageLimitPromptHint } from '@/lib/page-limits'
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
    const pageLimit = pageLimitForPlan(await getPlanCodeForUser(userData.user.id))
    return runGenerate(body, pageLimit)
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
    const res = await runGenerate(body, pageLimit)
    if (res.ok) {
      const data = (await res.clone().json().catch(() => null)) as { source?: string } | null
      counted = data?.source === 'ai'
    }
    return res
  } finally {
    if (!counted) await releaseAnonAiActions(reservation.subjects)
  }
}

async function runGenerate({ prompt, lang, mode }: GenerateBody, pageLimit: number) {
  if (!prompt) return Response.json({ error: 'Prompt too short' }, { status: 400 })

  const normalizedLang: 'tr' | 'en' = lang === 'en' ? 'en' : 'tr'
  const language = normalizedLang === 'en' ? 'English' : 'Turkish'

  const ecommerce = isEcommerceIntent(prompt)

  /* ---- Website mode: produce a full structured WebsiteSchema ---- */
  if (mode === 'website') {
    try {
      const { object: generated } = await generateObject({
        model: 'openai/gpt-5-mini',
        // Includes meta.seoTitle (auto-generated on creation) but excludes the
        // owner-only `tracking` snippets.
        schema: websiteGenerationSchema,
        // websiteSchema has optional fields (e.g. navigation.cta). ai@7 sets
        // strictJsonSchema=true by default, so OpenAI 400s on optional keys not
        // in `required`. Relax strict mode so AI website generation succeeds
        // instead of always falling back to the deterministic template.
        providerOptions: { openai: { strictJsonSchema: false } },
        system:
          `You are GLOVAL AI (gloval.ai), an AI website builder. Given a user's description, ` +
          `produce a complete, structured website as JSON that matches the provided schema. ` +
          `Respond with all human-readable text written in ${language}. ` +
          `Set meta.language to "${normalizedLang}". Choose a cohesive palette with valid hex colors and ` +
          `real Google Font names. Order the homepage sections sensibly, always starting with a hero and ` +
          `ending with a footer. Aim for 7-10 well-chosen sections. ` +
          `This looks like ${sectorPromptHint(prompt)} ` +
          (ecommerce
            ? `IMPORTANT: the user explicitly wants an ONLINE STORE. This MUST be a complete e-commerce ` +
              `site — never a corporate "Home + About" brochure. It MUST include a "categories" section, ` +
              `at least one "products" section with real products (name, price, and a "Sepete Ekle"/"Add to ` +
              `Cart" buttonText; add oldPrice + a discount badge on sale items) and a "products" page in ` +
              `pages. Prefer a "slider" hero for campaign slides. `
            : '') +
          pageLimitPromptHint(pageLimit) +
          `Use the available section types richly and appropriately: hero, about, services, features, ` +
          `stats, testimonials, gallery, portfolio, process, team, pricing, faq, contact, cta, footer. ` +
          `Set meta.seoTitle to a short, keyword-rich search phrase (3-6 words) that helps this ` +
          `business rank on Google: lead with the city or district when the brief mentions one, ` +
          `then the main service keyword a customer would actually search for ` +
          `(e.g. "İstanbul Evden Eve Nakliyat", "Kadıköy Diş Kliniği", "Ankara Oto Galeri"). ` +
          `Never repeat the brand name in meta.seoTitle and never add punctuation or a slogan. ` +
          `Give the hero a badge and a trustText, and write descriptive imagePrompt fields for hero, ` +
          `gallery, portfolio and team images. ` +
          `Use lucide-react icon names (lowercase) for any icon fields. ` +
          `Be specific to the user's idea — never generic placeholder text. ` +
          `Do NOT output any HTML, React, or code; only structured content.`,
        prompt: prompt.slice(0, 800),
      })

      // The prompt asks for at most `pageLimit` pages, but the model can still
      // overshoot; hard-cap the generated site so it never exceeds the plan.
      const object = capPagesToLimit(generated, pageLimit)

      // If the model skipped or blanked the SEO title, fall back to the
      // deterministic keyword derivation so a new site is never published
      // without one.
      if (!object.meta.seoTitle?.trim()) {
        object.meta.seoTitle = deriveSeoTitle(prompt, detectSector(prompt), normalizedLang)
      }

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

      return Response.json({
        // Seeds the floating phone + WhatsApp buttons from the site's own
        // contact section, so every new site ships them without the model
        // being able to invent a phone number.
        website: seedContactActions(normalizeCorporateSectionOrder(object)),
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
      console.log('[v0] generate(website) error:', err instanceof Error ? err.message : err)
      const website = capPagesToLimit(fallbackWebsite(prompt, normalizedLang), pageLimit)
      const [img, sectionImages] = await Promise.all([
        attachHeroImage(website, prompt),
        attachSectionImages(website, prompt),
      ])
      return Response.json({
        website: seedContactActions(normalizeCorporateSectionOrder(website)),
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
  try {
    const { object } = await generateObject({
      model: 'openai/gpt-5-mini',
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
    console.log('[v0] generate error:', err instanceof Error ? err.message : err)
    return Response.json({
      plan: fallbackPlan(prompt, normalizedLang),
      source: 'fallback',
    })
  }
}
