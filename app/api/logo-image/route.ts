import { websiteSchema } from '@/lib/website-schema'
import { createClient } from '@/lib/supabase/server'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance, hasLedgerReason, refundCredits } from '@/lib/ai-credits'
import { recordAiGenerationEvent } from '@/lib/ai-generation-events'
import { refundRound, runPaidRound, type CreditPort } from '@/lib/logo-studio/paid-round'
import { getPlanCodeForUser } from '@/lib/billing'
import { canUseLogoGeneration, toPlanCode } from '@/lib/pricing-config'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'
import { resolveTheme } from '@/components/website-renderer/theme'
import { buildTextAssets } from '@/lib/logo-studio/font-source'
import { resolveAiModel } from '@/lib/ai-models'
import { generateEmblemRound } from '@/lib/logo-studio/emblem-ai'
import type { EmblemAsset, LogoPalette } from '@/lib/logo-studio/compose'
import { AI_EMBLEMS_PER_ROUND, LOGO_STYLE_IDS, type LogoStyleId } from '@/lib/logo-studio/rules'

// Four emblems are drawn in parallel, each with one automatic retry (Opus falls
// back to Sonnet); per-attempt budgets live in AI_MODEL_ATTEMPT_TIMEOUT_MS.
export const maxDuration = 300

const EMBLEM_COUNT = AI_EMBLEMS_PER_ROUND
const STYLES = LOGO_STYLE_IDS

const creditPort: CreditPort = {
  balance: getCreditBalance,
  consume: consumeCredits,
  refund: refundCredits,
  hasLedgerReason,
}
type LogoStyle = LogoStyleId

function distinctAccent(primary: string, accent: string, foreground: string): string {
  return primary.toLowerCase() === accent.toLowerCase() ? foreground : accent
}

/**
 * POST /api/logo-image
 * ---------------------
 * Logo Studio backend. The logo is assembled from three separately produced
 * parts so the brand name is ALWAYS spelled correctly and perfectly sharp:
 *
 *  1. TEXT  — the brand name converted to vector outlines from the site's own
 *     heading font (or a bundled fallback). Never drawn by an AI model.
 *  2. EMBLEM — a text-free symbol: drawn as SVG by an LLM in `mode: 'ai'`
 *     (Sonnet, or Opus on PRO / E-COMMERCE, picked by `resolveAiModel`), or taken
 *     from the deterministic local library in `mode: 'local'` (free). There is
 *     NO local fallback in AI mode: a library symbol would not match the sector,
 *     so a failed round returns `aiFailed` and costs nothing.
 *  3. COMPOSITION — done by the client (`lib/logo-studio/compose.ts`), which can
 *     measure the emblem's real bounds and crop exactly.
 *
 * Every mode requires sign-in and a Starter+ plan (401 / 403). `mode: 'local'`
 * and `textOnly` then cost nothing; `mode: 'ai'` charges
 * `AI_ACTION_COSTS.logoImage` per emblem that passed the quality gate AND is
 * returned (never for a failed, rejected or timed-out one; see
 * `lib/logo-studio/paid-round.ts`). A `requestId` makes retries idempotent.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    schema?: unknown
    companyName?: string
    sector?: string
    description?: string
    style?: string
    symbol?: string
    request?: string
    mode?: string
    seed?: number
    /** Only re-typeset the name for another style: free, no emblems, no sign-in. */
    textOnly?: boolean
    colorMode?: string
    /** Client-generated id of this request; makes retries and double clicks charge once. */
    requestId?: string
  }

  const parsed = websiteSchema.safeParse(body.schema)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid site schema' }, { status: 400 })
  }
  const site = parsed.data
  const textOnly = body.textOnly === true
  const mode = body.mode === 'local' || textOnly ? 'local' : 'ai'
  const seed = Math.max(0, Math.trunc(Number(body.seed) || 0))

  // The logo studio (every mode, including the free local/text-only ones) is a
  // Starter+ feature. The client lock is only UX; this is the real check.
  const supabase = await createClient()
  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId: string = userData.user.id

  const planCode = toPlanCode(await getPlanCodeForUser(userId))
  if (!canUseLogoGeneration(planCode)) {
    return Response.json({ error: 'Plan required', code: 'plan_required' }, { status: 403 })
  }
  if (mode === 'ai') {
    const dailyLimit = await checkFreeDailyActionLimit(userId, planCode)
    if (!dailyLimit.allowed) {
      return Response.json(freeDailyLimitResponseBody(dailyLimit), { status: 429 })
    }
  }

  const brand = (body.companyName || site.navigation.logoText || site.meta.name).trim().slice(0, 60)
  if (!brand) return Response.json({ error: 'Missing brand name' }, { status: 400 })
  const sector = (body.sector || site.meta.audience || '').trim()
  const description = (body.description || site.meta.tagline || '').trim()
  const style: LogoStyle = STYLES.includes(body.style as LogoStyle) ? (body.style as LogoStyle) : 'modern'
  const colorMode = body.colorMode === 'mono' ? 'mono' : 'duo'
  const symbol = `${body.symbol ?? ''} ${body.request ?? ''}`.trim().slice(0, 200)

  const theme = resolveTheme(site)
  const palette: LogoPalette = {
    primary: theme.primary,
    accent: distinctAccent(theme.primary, theme.accent, theme.foreground),
    primaryFg: theme.primaryFg,
  }

  const cost = AI_ACTION_COSTS.logoImage
  const useAi = mode === 'ai' && !textOnly
  const requestId = typeof body.requestId === 'string' && /^[\w-]{8,64}$/.test(body.requestId) ? body.requestId : undefined
  const colors = colorMode === 'mono' ? [palette.primary] : [palette.primary, palette.accent]
  let charged = 0
  let chargeReason = ''

  try {
    const textPromise = buildTextAssets(brand, style)
    let aiEmblems: EmblemAsset[] = []
    let balance: number | undefined
    let requested = 0

    if (useAi && userId) {
      // The plan is read on the server above (never from the request body).
      const selection = resolveAiModel('logoEmblem', planCode)
      const result = await runPaidRound({
        userId,
        requestId,
        selection,
        cost,
        maxCount: EMBLEM_COUNT,
        round: { brand, sector, description, style, symbol, colors, seed, idPrefix: `ai-${seed}` },
        credits: creditPort,
        generate: generateEmblemRound,
        isAborted: () => req.signal.aborted,
        record: (delivered) =>
          Promise.all(
            delivered.map((d) =>
              recordAiGenerationEvent({ ...selection, model: d.model }, d.kind, undefined, 'logo'),
            ),
          ).then(() => undefined),
      })

      if (result.status === 'duplicate') {
        return Response.json({ error: 'Duplicate request' }, { status: 409 })
      }
      if (result.status === 'no_credits') {
        return Response.json({ error: 'Out of credits', balance: result.balance }, { status: 402 })
      }
      if (result.status === 'aborted') {
        return Response.json({ error: 'Request cancelled' }, { status: 499 })
      }
      requested = result.status === 'ok' ? result.requested : 0
      console.info('[logo-emblem]', {
        plan: planCode,
        tier: selection.tier,
        model: selection.model,
        status: result.status,
        passed: result.status === 'ok' ? result.emblems.length : 0,
        failures: result.failures,
      })
      if (result.status === 'ok') {
        aiEmblems = result.emblems
        balance = result.balance
        charged = result.charged
        chargeReason = result.reason
      } else {
        balance = result.balance
      }
    }

    const { assets, fontName } = await textPromise
    const aiCount = aiEmblems.length
    return Response.json({
      mode,
      seed,
      brand,
      fontName,
      text: assets,
      aiEmblems,
      context: `${sector} ${description}`.trim(),
      palette,
      foreground: theme.foreground,
      aiCount,
      aiRequested: requested,
      aiFailed: useAi && aiCount === 0,
      balance,
    })
  } catch (err) {
    console.log('[v0] logo-image error:', err instanceof Error ? err.message : err)
    // The emblems were charged but could not be delivered: give the credits back.
    if (userId && charged > 0) {
      await refundRound(creditPort, userId, charged, chargeReason).catch(() => undefined)
    }
    return Response.json({ error: 'Logo generation failed' }, { status: 500 })
  }
}
