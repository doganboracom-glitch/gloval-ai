import { z } from 'zod'
import { publishGoogleAdsPlan } from '@/lib/ads/google-ads-publish'
import { googleAdsJson } from '@/lib/ads/google-route-utils'
import { publishGateResponse, requireGoogleAdsPublishRequest } from '@/lib/ads/google-publish-route'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const publishSchema = z.object({
  planId: z.string().uuid(),
  expectedVersion: z.number().int().min(1),
  approvalHash: z.string().regex(/^[a-f0-9]{64}$/),
  confirm: z.literal(true),
  phase: z.enum(['validate', 'publish']),
})

function responseStatus(reason: string): number {
  if (reason === 'not_authenticated') return 401
  if (reason === 'plan_not_found' || reason === 'connection_not_found') return 404
  if (reason === 'publish_disabled') return 404
  if (reason === 'insufficient_credits') return 402
  if (reason === 'reservation_failed' || reason === 'provider_error') return 503
  if (reason === 'invalid_request' || reason === 'invalid_budget' || reason === 'invalid_publish_plan') return 400
  return 409
}

export async function POST(request: Request) {
  const gate = await requireGoogleAdsPublishRequest(request)
  if (publishGateResponse(gate)) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return googleAdsJson({ ok: false, error: 'invalid_request' }, 400)
  }
  const input = publishSchema.safeParse(body)
  if (!input.success) return googleAdsJson({ ok: false, error: 'confirmation_required' }, 400)

  const result = await publishGoogleAdsPlan({
    userId: gate.userId,
    planId: input.data.planId,
    expectedVersion: input.data.expectedVersion,
    approvalHash: input.data.approvalHash,
    userConfirmed: input.data.confirm,
    validateOnly: input.data.phase === 'validate',
  })

  if (!result.ok) return googleAdsJson({ ok: false, error: result.reason, balance: result.balance }, responseStatus(result.reason))
  return googleAdsJson(result)
}
