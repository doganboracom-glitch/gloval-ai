import { websiteSchema } from '@/lib/website-schema'
import { createClient } from '@/lib/supabase/server'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance } from '@/lib/ai-credits'
import { generateSiteImage, type ImageAspect } from '@/lib/image-provider'
import { getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'

// Several logo alternatives are generated in parallel; each call is already
// bounded by `generateSiteImage`'s own ~25s timeout, so 60s leaves headroom.
export const maxDuration = 60

const MAX_ALTERNATIVES = 4
const STYLES = ['modern', 'classic', 'minimal', 'playful', 'luxury', 'tech'] as const
const FORMATS = ['horizontal', 'square', 'vertical'] as const

type LogoStyle = (typeof STYLES)[number]
type LogoFormat = (typeof FORMATS)[number]

const FORMAT_ASPECT: Record<LogoFormat, ImageAspect> = {
  square: '1:1',
  horizontal: '16:9',
  vertical: '9:16',
}

const STYLE_HINT: Record<LogoStyle, string> = {
  modern: 'clean geometric shapes, confident sans-serif feel, contemporary',
  classic: 'timeless, balanced proportions, traditional emblem feel',
  minimal: 'extremely simple, one or two shapes, generous negative space',
  playful: 'rounded friendly shapes, approachable, lightly whimsical',
  luxury: 'refined, elegant, premium, subtle metallic or monoline feel',
  tech: 'sharp geometric lines, precise angles, digital-native feel',
}

const VARIATION_HINTS = [
  'a bold abstract mark',
  'a badge or emblem composition',
  'a simple geometric monogram',
  'a friendly rounded icon',
]

/**
 * POST /api/logo-image
 * ---------------------
 * Generates 1-4 REAL logo alternatives with the AI Gateway image model —
 * distinct from the deterministic, free `buildLogoMark` initials generator in
 * `lib/logo-mark.ts`. Every candidate is built from the site's OWN palette so
 * the result always matches the brand's existing colors; the caller previews
 * the alternatives and applies one explicitly (see `logo-field.tsx`) — nothing
 * here writes to the schema.
 *
 * Credits are charged per alternative that actually generated (never for a
 * failed/timed-out one), mirroring `/api/hero-image`'s "pay only for what you
 * got" rule.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    schema?: unknown
    companyName?: string
    sector?: string
    description?: string
    style?: string
    symbol?: string
    format?: string
    count?: number
  }

  const parsed = websiteSchema.safeParse(body.schema)
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

  const companyName = (body.companyName || site.navigation.logoText || site.meta.name).trim()
  const sector = (body.sector || site.meta.audience || '').trim()
  const description = (body.description || site.meta.tagline || '').trim()
  const style: LogoStyle = STYLES.includes(body.style as LogoStyle)
    ? (body.style as LogoStyle)
    : 'modern'
  const format: LogoFormat = FORMATS.includes(body.format as LogoFormat)
    ? (body.format as LogoFormat)
    : 'square'
  const symbol = (body.symbol || '').trim()
  const count = Math.min(Math.max(Math.trunc(body.count ?? 3), 1), MAX_ALTERNATIVES)

  // The brand's own palette, so every alternative actually matches the site
  // instead of the model guessing new colors.
  const colors = site.theme.palette.slice(0, 4).map((c) => c.hex)

  const cost = AI_ACTION_COSTS.logoImage
  const balance = await getCreditBalance(userId)
  if (balance < cost * count) {
    return Response.json({ error: 'Out of credits', balance }, { status: 402 })
  }

  const basePrompt = [
    `Professional vector logo${symbol ? ` featuring ${symbol}` : ''} for a brand named "${companyName}"${sector ? ` in the ${sector} industry` : ''}.`,
    description ? `Brand description: ${description}.` : '',
    `Visual style: ${STYLE_HINT[style]}.`,
    `Use ONLY this exact color palette: ${colors.join(', ')}.`,
    format === 'horizontal'
      ? 'Horizontal lockup: icon plus clean wordmark side by side.'
      : format === 'vertical'
        ? 'Vertical lockup: icon stacked above a short wordmark.'
        : 'Standalone square icon mark, no wordmark.',
    'Flat vector illustration on a plain solid single-color background, logo tightly cropped with minimal margins, high contrast, print-ready branding asset, no mockup, no photo, no shadow, no border.',
  ]
    .filter(Boolean)
    .join(' ')

  try {
    const results = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        generateSiteImage({
          prompt: `${basePrompt} Variation: ${VARIATION_HINTS[i % VARIATION_HINTS.length]}.`,
          aspectRatio: FORMAT_ASPECT[format],
        }),
      ),
    )

    const alternatives = results
      .filter((r): r is NonNullable<typeof r> => Boolean(r?.src))
      .map((r) => ({ src: r.src }))

    if (alternatives.length === 0) {
      return Response.json(
        { error: 'Logo generation failed', alternatives: [] },
        { status: 502 },
      )
    }

    const charge = await consumeCredits(userId, cost * alternatives.length, 'logoImage')
    if (!charge.ok) {
      // The balance check above already passed, so this only fires on a rare
      // race between two simultaneous requests — fail closed rather than
      // handing back free logos.
      return Response.json({ error: 'Out of credits', balance: charge.balance }, { status: 402 })
    }

    return Response.json({ alternatives, balance: charge.balance, format })
  } catch (err) {
    console.log('[v0] logo-image error:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Logo generation failed' }, { status: 500 })
  }
}
