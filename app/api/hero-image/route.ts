import { websiteSchema } from '@/lib/website-schema'
import {
  applyHeroImageRequest,
  applySlideImageRequest,
  attachHeroImage,
} from '@/lib/hero-image'
import { createClient } from '@/lib/supabase/server'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance } from '@/lib/ai-credits'
import { getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'

// Regenerating the hero/slider images runs the primary image first (awaited)
// then the rest in parallel; a 60s budget leaves comfortable headroom.
export const maxDuration = 60

/**
 * POST /api/hero-image
 * --------------------
 * Retries ONLY the hero/slider image generation for an already-built site.
 * It keeps the existing text and design untouched — `attachHeroImage` mutates
 * just the image fields — regenerates a fresh image, and returns the updated
 * schema plus a status. Used by the "regenerate hero image" retry button so a
 * failed image never forces the user to rebuild the whole site.
 */
export async function POST(req: Request) {
  const { schema, prompt, request, slideIndex } = (await req
    .json()
    .catch(() => ({}))) as {
    schema?: unknown
    prompt?: string
    /**
     * An explicit visual request ("kamyonete koli yükleyen personel") or a
     * direct image URL. When present the hero image is replaced from THIS
     * description instead of being re-derived from the original site brief.
     */
    request?: string
    /**
     * When present, only the slider slide at this index is regenerated — the
     * per-slide upload / AI controls target a single slide, not the whole hero.
     */
    slideIndex?: number
  }

  const parsed = websiteSchema.safeParse(schema)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid site schema' }, { status: 400 })
  }

  const site = parsed.data

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

  const cost = AI_ACTION_COSTS.heroImage
  const balance = await getCreditBalance(userId)
  if (balance < cost) {
    return Response.json({ error: 'Out of credits', balance }, { status: 402 })
  }

  /** Spend a credit only once an image was actually generated/linked. */
  async function chargeIfGenerated(generated: boolean) {
    if (!generated) return null
    const charge = await consumeCredits(userId, cost, 'heroImage')
    return charge.ok ? null : charge.balance
  }

  // Per-slide request mode: deterministic, only touches ONE slide's image.
  if (
    typeof slideIndex === 'number' &&
    Number.isInteger(slideIndex) &&
    slideIndex >= 0 &&
    typeof request === 'string' &&
    request.trim().length > 1
  ) {
    try {
      const outcome = await applySlideImageRequest(site, slideIndex, request.trim())
      const generated = outcome.status === 'generated' || outcome.status === 'linked'
      if (!generated) console.log('[v0] slide-image request not generated, status:', outcome.status)
      const insufficientBalance = await chargeIfGenerated(generated)
      if (insufficientBalance !== null) {
        return Response.json({ error: 'Out of credits', balance: insufficientBalance }, { status: 402 })
      }
      return Response.json({
        website: site,
        image: {
          available: outcome.status !== 'skipped',
          generated,
          status: outcome.status,
          imagePrompt: outcome.imagePrompt,
        },
      })
    } catch (err) {
      console.log('[v0] slide-image request error:', err instanceof Error ? err.message : err)
      return Response.json({ error: 'Image generation failed' }, { status: 500 })
    }
  }

  // Explicit-request mode: deterministic, only touches the hero image fields.
  if (typeof request === 'string' && request.trim().length > 1) {
    try {
      const outcome = await applyHeroImageRequest(site, request.trim())
      const generated = outcome.status === 'generated' || outcome.status === 'linked'
      if (!generated) console.log('[v0] hero-image request not generated, status:', outcome.status)
      const insufficientBalance = await chargeIfGenerated(generated)
      if (insufficientBalance !== null) {
        return Response.json({ error: 'Out of credits', balance: insufficientBalance }, { status: 402 })
      }
      return Response.json({
        website: site,
        image: {
          available: outcome.status !== 'skipped',
          generated,
          status: outcome.status,
          imagePrompt: outcome.imagePrompt,
        },
      })
    } catch (err) {
      console.log('[v0] hero-image request error:', err instanceof Error ? err.message : err)
      return Response.json({ error: 'Image generation failed' }, { status: 500 })
    }
  }
  const basis =
    (prompt && prompt.trim()) ||
    // Fall back to the site's own signals when no original prompt is provided.
    `${site.meta.name} ${site.meta.audience ?? ''} ${site.meta.tagline ?? ''}`.trim()

  try {
    // Clear any stale hero/slide src so a genuine failure can't silently keep
    // showing a previous image and mask the retry outcome.
    const hero = site.sections.find((s) => s.type === 'hero') as
      | Extract<(typeof site.sections)[number], { type: 'hero' }>
      | undefined
    const previousHeroSrc = hero?.image?.src
    const previousSlideSrcs = (hero?.slides ?? []).map((slide) => slide.image?.src)
    if (hero?.image) hero.image.src = undefined
    for (const slide of hero?.slides ?? []) {
      if (slide.image) slide.image.src = undefined
    }

    const img = await attachHeroImage(site, basis)
    // A failed run must never destroy the image the user already has: restore
    // the previous sources. The response still reports status 'failed'.
    // This also covers PARTIAL success: only a few images are regenerated per
    // run, so any image that still has no src keeps its previous one.
    if (hero?.image && !hero.image.src) hero.image.src = previousHeroSrc
    ;(hero?.slides ?? []).forEach((slide, i) => {
      if (slide.image && !slide.image.src) slide.image.src = previousSlideSrcs[i]
    })
    if (!img.generated) {
      console.log('[v0] hero-image retry: generation did not succeed', {
        available: img.available,
        generated: img.generated,
      })
    }
    const insufficientBalance = await chargeIfGenerated(img.generated)
    if (insufficientBalance !== null) {
      return Response.json({ error: 'Out of credits', balance: insufficientBalance }, { status: 402 })
    }
    return Response.json({
      website: site,
      image: {
        sector: img.brief.sector,
        available: img.available,
        generated: img.generated,
        status: img.available ? (img.generated ? 'completed' : 'failed') : 'skipped',
      },
    })
  } catch (err) {
    console.log('[v0] hero-image retry error:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Image generation failed' }, { status: 500 })
  }
}
