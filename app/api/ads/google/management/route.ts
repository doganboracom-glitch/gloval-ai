import { z } from 'zod'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import { getGoogleAdsManagementSnapshot, applyGoogleAdsManagementAction } from '@/lib/ads/google-ads-management'
import { googleAdsErrorResponse, googleAdsJson } from '@/lib/ads/google-route-utils'
import { publishGateResponse, requireGoogleAdsPublishRequest } from '@/lib/ads/google-publish-route'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const actionSchema = z.object({
  planId: z.string().uuid(),
  actionId: z.string().uuid(),
  expectedVersion: z.number().int().min(1),
  expectedStateHash: z.string().regex(/^[a-f0-9]{64}$/),
  action: z.enum(['pause', 'enable', 'budget', 'ad_copy']),
  dailyBudgetMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  headlines: z.array(z.string().max(30)).optional(),
  descriptions: z.array(z.string().max(90)).optional(),
  acknowledgedBillingWarning: z.boolean().optional(),
  acknowledgedBudget: z.boolean().optional(),
  confirm: z.literal(true),
})

export async function GET(request: Request) {
  const gate = await requireGoogleAdsPublishRequest(request)
  if (publishGateResponse(gate)) return gate.response

  const planId = new URL(request.url).searchParams.get('planId') ?? ''
  if (!z.string().uuid().safeParse(planId).success) {
    return googleAdsJson({ ok: false, error: 'invalid_request' }, 400)
  }

  try {
    const snapshot = await getGoogleAdsManagementSnapshot(gate.userId, planId, gate.identity)
    return googleAdsJson({ ok: true, snapshot })
  } catch (error) {
    return googleAdsErrorResponse(error instanceof GoogleAdsError ? error : new GoogleAdsError('provider_error'))
  }
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
  const input = actionSchema.safeParse(body)
  if (!input.success) return googleAdsJson({ ok: false, error: 'confirmation_required' }, 400)

  try {
    const result = await applyGoogleAdsManagementAction({
      userId: gate.userId,
      accessIdentity: gate.identity,
      planId: input.data.planId,
      actionId: input.data.actionId,
      expectedVersion: input.data.expectedVersion,
      expectedStateHash: input.data.expectedStateHash,
      action: input.data.action,
      dailyBudgetMinor: input.data.dailyBudgetMinor,
      headlines: input.data.headlines,
      descriptions: input.data.descriptions,
      acknowledgedBillingWarning: input.data.acknowledgedBillingWarning,
      acknowledgedBudget: input.data.acknowledgedBudget,
      userConfirmed: input.data.confirm,
    })
    return googleAdsJson({ ok: true, ...result })
  } catch (error) {
    return googleAdsErrorResponse(error instanceof GoogleAdsError ? error : new GoogleAdsError('provider_error'))
  }
}
