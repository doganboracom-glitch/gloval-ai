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
  publishConfirmed: z.boolean().optional(),
}).refine((input) => input.phase !== 'publish' || input.publishConfirmed === true)

function responseStatus(reason: string): number {
  if (reason === 'not_authenticated' || reason === 'reauth_required') return 401
  if (reason === 'not_authorized' || reason === 'google_access_level_insufficient') return 403
  if (reason === 'plan_not_found' || reason === 'connection_not_found' || reason === 'publish_disabled') return 404
  if (reason === 'insufficient_credits') return 402
  if (reason === 'api_quota_exceeded' || reason === 'rate_limited') return 429
  if (reason === 'provider_unavailable') return 502
  if (
    reason === 'reservation_failed' ||
    reason === 'provider_error' ||
    reason === 'quota_check_failed' ||
    reason === 'configuration_missing' ||
    reason === 'status_update_failed'
  ) return 503
  if (
    reason === 'invalid_request' ||
    reason === 'invalid_budget' ||
    reason === 'invalid_publish_plan' ||
    reason === 'confirmation_required'
  ) return 400
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
    accessIdentity: gate.identity,
    planId: input.data.planId,
    expectedVersion: input.data.expectedVersion,
    approvalHash: input.data.approvalHash,
    userConfirmed: input.data.confirm,
    validateOnly: input.data.phase === 'validate',
    finalConfirmation: input.data.phase === 'publish' && input.data.publishConfirmed === true,
  })

  if (!result.ok) return googleAdsJson({ ok: false, error: result.reason, balance: result.balance }, responseStatus(result.reason))
  return googleAdsJson(result)
}
