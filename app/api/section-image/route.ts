import { websiteSchema } from '@/lib/website-schema'
import { applyItemImageRequest, attachSectionImages } from '@/lib/section-images'
import { createClient } from '@/lib/supabase/server'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance } from '@/lib/ai-credits'
import { getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'

// One image (or a small parallel batch) with a 25s per-image provider cap.
export const maxDuration = 60

/**
 * POST /api/section-image
 * -----------------------
 * Regenerates images that are NOT the hero: a single gallery / portfolio /
 * team item (when `index` and `itemIndex` are given), or every still-missing
 * section image at once (when they are omitted). Text, colors and layout are
 * never touched — only image fields — so this can never undo a manual edit.
 */
export async function POST(req: Request) {
  const { schema, index, itemIndex, request } = (await req.json().catch(() => ({}))) as {
    schema?: unknown
    index?: number
    itemIndex?: number
    /** A visual description, or a direct image URL to link verbatim. */
    request?: string
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

  const cost = AI_ACTION_COSTS.sectionImage
  const balance = await getCreditBalance(userId)
  if (balance < cost) {
    return Response.json({ error: 'Out of credits', balance }, { status: 402 })
  }

  try {
    if (typeof index === 'number' && typeof itemIndex === 'number') {
      const outcome = await applyItemImageRequest(site, index, itemIndex, request ?? '')
      const generated = outcome.status === 'generated' || outcome.status === 'linked'
      if (generated) {
        const charge = await consumeCredits(userId, cost, 'sectionImage')
        if (!charge.ok) {
          return Response.json({ error: 'Out of credits', balance: charge.balance }, { status: 402 })
        }
      }
      return Response.json({
        website: site,
        image: { status: outcome.status, imagePrompt: outcome.imagePrompt },
      })
    }

    const result = await attachSectionImages(site)
    const status = !result.available
      ? 'skipped'
      : result.generated > 0
        ? 'generated'
        : result.requested === 0
          ? 'generated'
          : 'failed'
    if (status === 'generated' && result.generated > 0) {
      // Multiple images can be generated in one batch; charge per image so
      // "regenerate all missing images" costs proportionally to what it did.
      const charge = await consumeCredits(userId, cost * result.generated, 'sectionImage:batch')
      if (!charge.ok) {
        return Response.json({ error: 'Out of credits', balance: charge.balance }, { status: 402 })
      }
    }
    return Response.json({
      website: site,
      image: {
        status,
        generated: result.generated,
        requested: result.requested,
      },
    })
  } catch (err) {
    console.log('[v0] section-image error:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Image generation failed' }, { status: 500 })
  }
}
