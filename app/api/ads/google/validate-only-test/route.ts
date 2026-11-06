import { z } from 'zod'
import { publishGoogleAdsPlan } from '@/lib/ads/google-ads-publish'
import { googleAdsJson } from '@/lib/ads/google-route-utils'
import {
  publishGateResponse,
  requireGoogleAdsValidateOnlyTestRequest,
} from '@/lib/ads/google-publish-route'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const validationTestSchema = z.object({
  planId: z.string().uuid(),
  confirm: z.literal(true),
  euPoliticalAdvertising: z.enum(['yes', 'no']),
  euPoliticalDeclarationConfirmed: z.literal(true),
}).strict()

function responseStatus(reason: string): number {
  if (reason === 'not_authenticated' || reason === 'reauth_required') return 401
  if (reason === 'not_authorized' || reason === 'google_access_level_insufficient') return 403
  if (reason === 'plan_not_found' || reason === 'publish_disabled') return 404
  if (reason === 'api_quota_exceeded' || reason === 'rate_limited') return 429
  if (reason === 'provider_unavailable') return 502
  if (reason === 'provider_error' || reason === 'quota_check_failed' || reason === 'configuration_missing') return 503
  if (reason === 'invalid_request' || reason === 'confirmation_required' || reason === 'eu_political_declaration_required') return 400
  return 409
}

export async function POST(request: Request) {
  const gate = await requireGoogleAdsValidateOnlyTestRequest(request)
  if (publishGateResponse(gate)) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return googleAdsJson({ ok: false, error: 'invalid_request' }, 400)
  }

  const input = validationTestSchema.safeParse(body)
  if (!input.success) return googleAdsJson({ ok: false, error: 'confirmation_required' }, 400)

  const result = await publishGoogleAdsPlan({
    userId: gate.userId,
    planId: input.data.planId,
    userConfirmed: input.data.confirm,
    validateOnly: true,
    validationTestMode: true,
    euPoliticalAdvertising: input.data.euPoliticalAdvertising,
    euPoliticalDeclarationConfirmed: input.data.euPoliticalDeclarationConfirmed,
  })

  if (!result.ok) {
    return googleAdsJson({ ok: false, error: result.reason }, responseStatus(result.reason))
  }

  return googleAdsJson(result)
}
