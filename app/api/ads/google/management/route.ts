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
  action: z.enum(['pause', 'enable', 'budget', 'ad_copy', 'keyword', 'archive', 'undo']),
  dailyBudgetMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  headlines: z.array(z.string().max(30)).optional(),
  descriptions: z.array(z.string().max(90)).optional(),
  keywordOperation: z.enum(['add', 'remove']).optional(),
  keywordText: z.string().max(80).optional(),
  keywordMatchType: z.enum(['EXACT', 'PHRASE']).optional(),
  keywordNegative: z.boolean().optional(),
  keywordResourceName: z.string().max(160).optional(),
  undoActionId: z.string().uuid().optional(),
  acknowledgedBillingWarning: z.boolean().optional(),
  riskConfirmedAmountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
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
    const management = await getGoogleAdsManagementSnapshot(gate.userId, planId)
    return googleAdsJson({ ok: true, ...management })
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
      planId: input.data.planId,
      actionId: input.data.actionId,
      expectedVersion: input.data.expectedVersion,
      expectedStateHash: input.data.expectedStateHash,
      action: input.data.action,
      dailyBudgetMinor: input.data.dailyBudgetMinor,
      headlines: input.data.headlines,
      descriptions: input.data.descriptions,
      keywordOperation: input.data.keywordOperation,
      keywordText: input.data.keywordText,
      keywordMatchType: input.data.keywordMatchType,
      keywordNegative: input.data.keywordNegative,
      keywordResourceName: input.data.keywordResourceName,
      undoActionId: input.data.undoActionId,
      acknowledgedBillingWarning: input.data.acknowledgedBillingWarning,
      riskConfirmedAmountMinor: input.data.riskConfirmedAmountMinor,
      userConfirmed: input.data.confirm,
    })
    return googleAdsJson({ ok: true, ...result })
  } catch (error) {
    return googleAdsErrorResponse(error instanceof GoogleAdsError ? error : new GoogleAdsError('provider_error'))
  }
}
