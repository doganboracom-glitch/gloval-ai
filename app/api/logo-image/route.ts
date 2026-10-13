import { websiteSchema } from '@/lib/website-schema'
import { createClient } from '@/lib/supabase/server'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance } from '@/lib/ai-credits'
import { getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'
import { resolveTheme } from '@/components/website-renderer/theme'
import { buildTextAssets } from '@/lib/logo-studio/font-source'
import { aiEmblemAvailable, generateEmblem, EMBLEM_CONCEPTS } from '@/lib/logo-studio/emblem-ai'
import type { EmblemAsset, LogoPalette } from '@/lib/logo-studio/compose'
import { LOGO_STYLE_IDS, type LogoStyleId } from '@/lib/logo-studio/rules'

// Two emblems are drawn in parallel; each Claude call has its own 25s timeout.
export const maxDuration = 60

const EMBLEM_COUNT = 2
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
 *  2. EMBLEM — a text-free symbol: written by Claude in `mode: 'ai'`, or taken
 *     from the deterministic local library in `mode: 'local'` (free) and as the
 *     fallback when Claude is unavailable or fails.
 *  3. COMPOSITION — done by the client (`lib/logo-studio/compose.ts`), which can
 *     measure the emblem's real bounds and crop exactly.
 *
 * `mode: 'local'` needs no sign-in and costs nothing. `mode: 'ai'` requires
 * sign-in and charges `AI_ACTION_COSTS.logoImage` per emblem Claude actually
 * delivered (never for a failure or a local fallback).
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
  if (mode === 'ai') {
    const supabase = await createClient()
    const { data: userData, error: authError } = await supabase.auth.getUser()
    if (authError || !userData?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = userData.user.id

    const planCode = toPlanCode(await getPlanCodeForUser(userId))
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
  const useAi = mode === 'ai' && !textOnly && aiEmblemAvailable()
  if (useAi && userId) {
    const balance = await getCreditBalance(userId)
    if (balance < cost * EMBLEM_COUNT) {
      return Response.json({ error: 'Out of credits', balance }, { status: 402 })
    }
  }

  try {
    const [{ assets, fontName }, aiResults] = await Promise.all([
      buildTextAssets(brand, style),
      useAi && !textOnly
        ? Promise.all(
            Array.from({ length: EMBLEM_COUNT }, (_, i) =>
              generateEmblem({
                brand,
                sector,
                description,
                style,
                colorMode,
                symbol,
                colors: colorMode === 'mono' ? [palette.primary] : [palette.primary, palette.accent],
                concept: EMBLEM_CONCEPTS[(seed * EMBLEM_COUNT + i) % EMBLEM_CONCEPTS.length],
                idPrefix: `ai-${seed}-${i}`,
              }),
            ),
          )
        : Promise.resolve([] as (EmblemAsset | null)[]),
    ])

    const aiEmblems = aiResults.filter((e): e is EmblemAsset => e?.source === 'ai')
    const aiCount = aiEmblems.length

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
      aiFallback: mode === 'ai' && !textOnly && aiCount === 0,
      balance,
    })
  } catch (err) {
    console.log('[v0] logo-image error:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Logo generation failed' }, { status: 500 })
  }
}
