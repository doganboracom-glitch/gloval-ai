import { websiteSchema } from '@/lib/website-schema'
import { createClient } from '@/lib/supabase/server'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance } from '@/lib/ai-credits'
import { getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'
import { resolveTheme } from '@/components/website-renderer/theme'
import { buildTextAssets } from '@/lib/logo-studio/font-source'
import { resolveAiModel } from '@/lib/ai-models'
import { generateEmblemRound } from '@/lib/logo-studio/emblem-ai'
import type { EmblemAsset, LogoPalette } from '@/lib/logo-studio/compose'
import { AI_EMBLEMS_PER_ROUND, LOGO_STYLE_IDS, type LogoStyleId } from '@/lib/logo-studio/rules'

// Four emblems are drawn in parallel with one automatic retry each; Opus can
// need a while per attempt (see ATTEMPT_TIMEOUT_MS in lib/logo-studio/emblem-ai.ts).
export const maxDuration = 300

const EMBLEM_COUNT = AI_EMBLEMS_PER_ROUND
const STYLES = LOGO_STYLE_IDS
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
 * `mode: 'local'` needs no sign-in and costs nothing. `mode: 'ai'` requires
 * sign-in and charges `AI_ACTION_COSTS.logoImage` per emblem that passed the
 * quality gate (never for a failed or rejected one).
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
  }

  const parsed = websiteSchema.safeParse(body.schema)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid site schema' }, { status: 400 })
  }
  const site = parsed.data
  const textOnly = body.textOnly === true
  const mode = body.mode === 'local' || textOnly ? 'local' : 'ai'
  const seed = Math.max(0, Math.trunc(Number(body.seed) || 0))

  let userId: string | null = null
  let planCode = toPlanCode(null)
  if (mode === 'ai') {
    const supabase = await createClient()
    const { data: userData, error: authError } = await supabase.auth.getUser()
    if (authError || !userData?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = userData.user.id

    planCode = toPlanCode(await getPlanCodeForUser(userId))
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
  // A user who can afford fewer than a full round still gets as many emblems as
  // their balance covers; nothing is charged beyond what passes the gate.
  let emblemCount = EMBLEM_COUNT
  if (useAi && userId) {
    const balance = await getCreditBalance(userId)
    emblemCount = Math.min(EMBLEM_COUNT, Math.floor(balance / cost))
    if (emblemCount < 1) {
      return Response.json({ error: 'Out of credits', balance }, { status: 402 })
    }
  }

  try {
    const [{ assets, fontName }, outcomes] = await Promise.all([
      buildTextAssets(brand, style),
      useAi
        ? generateEmblemRound({
            selection: resolveAiModel('logoEmblem', planCode),
            brand,
            sector,
            description,
            style,
            symbol,
            colors: colorMode === 'mono' ? [palette.primary] : [palette.primary, palette.accent],
            count: emblemCount,
            seed,
            idPrefix: `ai-${seed}`,
          })
        : Promise.resolve([]),
    ])

    const aiEmblems: EmblemAsset[] = []
    for (const o of outcomes) if (o.ok) aiEmblems.push(o.emblem)
    const aiCount = aiEmblems.length
    if (useAi) {
      console.info('[logo-emblem]', {
        requested: emblemCount,
        passed: aiCount,
        failures: outcomes.flatMap((o) => (o.ok ? [] : [o.reason])),
      })
    }

    let balance: number | undefined
    if (aiCount > 0 && userId) {
      const charge = await consumeCredits(userId, cost * aiCount, 'logoImage')
      if (!charge.ok) {
        return Response.json({ error: 'Out of credits', balance: charge.balance }, { status: 402 })
      }
      balance = charge.balance
    }

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
      aiFailed: useAi && aiCount === 0,
      balance,
    })
  } catch (err) {
    console.log('[v0] logo-image error:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Logo generation failed' }, { status: 500 })
  }
}
