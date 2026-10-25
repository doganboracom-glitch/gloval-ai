import { rejectAnonymous } from '@/lib/api-auth'
import { websiteSchema } from '@/lib/website-schema'
import { createClient } from '@/lib/supabase/server'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance } from '@/lib/ai-credits'
import { getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'
import { generateServiceDetail } from '@/lib/service-detail-ai'
import { findServicesSection } from '@/lib/service-pages'

export const maxDuration = 60

/**
 * POST /api/service-detail
 * Writes one service's page text from the site's own facts (grounded; see
 * `lib/service-detail-ai.ts`). Charged at the text-edit price only when the
 * model's text survived the grounding guard; the free starter is never charged.
 * `item` indexes the first services section's items.
 */
export async function POST(req: Request) {
  const anonymous = await rejectAnonymous()
  if (anonymous) return anonymous

  const { schema, item } = (await req.json().catch(() => ({}))) as { schema?: unknown; item?: unknown }
  const parsed = websiteSchema.safeParse(schema)
  if (!parsed.success || typeof item !== 'number' || !Number.isInteger(item) || item < 0) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }
  const site = parsed.data
  const section = findServicesSection(site)
  if (!section || !section.items[item]) return Response.json({ error: 'Invalid request' }, { status: 400 })

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

  const result = await generateServiceDetail(site, item, planCode)
  if (result.blocks.length === 0) return Response.json({ error: 'Failed' }, { status: 500 })
  if (!result.written) return Response.json({ blocks: result.blocks, charged: 0, thinFacts: true })

  const charge = await consumeCredits(userId, cost, 'serviceDetail')
  if (!charge.ok) return Response.json({ error: 'Out of credits', balance: charge.balance }, { status: 402 })
  return Response.json({ blocks: result.blocks, charged: cost })
}
