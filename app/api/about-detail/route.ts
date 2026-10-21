import { websiteSchema } from '@/lib/website-schema'
import { createClient } from '@/lib/supabase/server'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance } from '@/lib/ai-credits'
import { getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'
import { generateAboutDetail, hasEnoughFacts } from '@/lib/about-detail-ai'
import { buildStarterAboutDetail, findAboutSection } from '@/lib/section-detail'

export const maxDuration = 60

/**
 * POST /api/about-detail
 * Writes the long About page body from the site's own facts (no invention; see
 * `lib/about-detail-ai.ts`). Charged at the text-edit price only when the model
 * actually produced the text; the free deterministic starter is never charged.
 * The result stays flagged `sample` until the owner approves it.
 */
export async function POST(req: Request) {
  const { schema } = (await req.json().catch(() => ({}))) as { schema?: unknown }
  const parsed = websiteSchema.safeParse(schema)
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 })
  const site = parsed.data
  const about = findAboutSection(site)
  if (!about) return Response.json({ error: 'No about section' }, { status: 400 })

  const supabase = await createClient()
  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = userData.user.id

  const planCode = toPlanCode(await getPlanCodeForUser(userId))
  const dailyLimit = await checkFreeDailyActionLimit(userId, planCode)
  if (!dailyLimit.allowed) return Response.json(freeDailyLimitResponseBody(dailyLimit), { status: 429 })

  const cost = AI_ACTION_COSTS.edit
  const balance = await getCreditBalance(userId)
  if (balance < cost) return Response.json({ error: 'Out of credits', balance }, { status: 402 })

  const detail = await generateAboutDetail(site, planCode)
  if (!detail) return Response.json({ error: 'Failed' }, { status: 500 })

  const starter = buildStarterAboutDetail(site, about)
  const written = hasEnoughFacts(site) && JSON.stringify(detail.blocks) !== JSON.stringify(starter.blocks)
  if (!written) return Response.json({ blocks: detail.blocks, charged: 0, thinFacts: true })

  const charge = await consumeCredits(userId, cost, 'aboutDetail')
  if (!charge.ok) return Response.json({ error: 'Out of credits', balance: charge.balance }, { status: 402 })
  return Response.json({ blocks: detail.blocks, charged: cost })
}
