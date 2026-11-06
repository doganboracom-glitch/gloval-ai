import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AdsRpcClient } from '@/lib/ads/credits'
import { createGoogleAdsPlanApprovalHash } from '@/lib/ads/google-ads-approval'
import {
  buildGoogleAdsApprovalSummary,
  isSupportedGoogleAdsCurrency,
  parseGoogleAdsPublishPlan,
} from '@/lib/ads/google-ads-publish-plan'
import { GOOGLE_ADS_PUBLISH_TERMS_VERSION } from '@/lib/ads/google-terms'
import { googleAdsJson } from '@/lib/ads/google-route-utils'
import { publishGateResponse, requireGoogleAdsPublishRequest } from '@/lib/ads/google-publish-route'

export const dynamic = 'force-dynamic'

const approvalSchema = z.object({
  planId: z.string().uuid(),
  expectedVersion: z.number().int().min(1),
  euPoliticalAdvertising: z.enum(['yes', 'no']),
  declarationConfirmed: z.literal(true),
  termsAccepted: z.literal(true),
})

export async function POST(request: Request) {
  const gate = await requireGoogleAdsPublishRequest(request)
  if (publishGateResponse(gate)) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return googleAdsJson({ ok: false, error: 'invalid_request' }, 400)
  }
  const input = approvalSchema.safeParse(body)
  if (!input.success) return googleAdsJson({ ok: false, error: 'confirmation_required' }, 400)

  const admin = createAdminClient()
  const { data: planRow, error: planError } = await admin
    .from('ads_plans')
    .select('id,user_id,connection_id,status,plan,version,approved_version,currency,daily_budget_minor')
    .eq('id', input.data.planId)
    .eq('user_id', gate.userId)
    .eq('platform', 'google_ads')
    .maybeSingle()
  if (planError) return googleAdsJson({ ok: false, error: 'provider_error' }, 502)
  if (!planRow) return googleAdsJson({ ok: false, error: 'plan_not_found' }, 404)
  if (!planRow.connection_id || !['draft', 'failed', 'approved'].includes(planRow.status)) {
    return googleAdsJson({ ok: false, error: 'plan_not_approved' }, 409)
  }
  if (planRow.version !== input.data.expectedVersion) {
    return googleAdsJson({ ok: false, error: 'plan_changed' }, 409)
  }

  const { data: connection, error: connectionError } = await admin
    .from('ads_connections')
    .select('id,external_account_id,currency_code,is_manager,status')
    .eq('id', planRow.connection_id)
    .eq('user_id', gate.userId)
    .eq('platform', 'google_ads')
    .maybeSingle()
  if (connectionError) return googleAdsJson({ ok: false, error: 'provider_error' }, 502)
  if (!connection || connection.status !== 'active') return googleAdsJson({ ok: false, error: 'connection_not_found' }, 404)
  if (connection.is_manager) return googleAdsJson({ ok: false, error: 'manager_account' }, 400)
  if (!connection.currency_code || connection.currency_code !== planRow.currency) {
    return googleAdsJson({ ok: false, error: 'currency_mismatch' }, 409)
  }
  if (!isSupportedGoogleAdsCurrency(connection.currency_code)) {
    return googleAdsJson({ ok: false, error: 'unsupported_currency' }, 400)
  }

  if (!Number.isSafeInteger(planRow.daily_budget_minor) || (planRow.daily_budget_minor as number) <= 0) {
    return googleAdsJson({ ok: false, error: 'invalid_budget' }, 400)
  }

  let plan: ReturnType<typeof parseGoogleAdsPublishPlan>
  let approvalSummary: ReturnType<typeof buildGoogleAdsApprovalSummary>
  try {
    plan = parseGoogleAdsPublishPlan({
      ...(planRow.plan as Record<string, unknown>),
      euPoliticalAdvertising: input.data.euPoliticalAdvertising,
      euPoliticalDeclarationConfirmed: true,
    })
    approvalSummary = {
      ...buildGoogleAdsApprovalSummary({
        currency: connection.currency_code,
        dailyBudgetMinor: planRow.daily_budget_minor as number,
      }),
      termsVersion: GOOGLE_ADS_PUBLISH_TERMS_VERSION,
    }
  } catch {
    return googleAdsJson({ ok: false, error: 'invalid_publish_plan' }, 400)
  }

  const approvalHash = createGoogleAdsPlanApprovalHash({
    userId: gate.userId,
    planId: planRow.id,
    planVersion: planRow.version,
    connectionId: connection.id,
    customerId: connection.external_account_id,
    currency: connection.currency_code,
    dailyBudgetMinor: planRow.daily_budget_minor as number,
    plan,
  })

  const rpc = admin as unknown as AdsRpcClient
  const { data, error } = await rpc.rpc('ads_approve_google_ads_plan_e2', {
    p_user_id: gate.userId,
    p_plan_id: planRow.id,
    p_expected_version: planRow.version,
    p_connection_id: connection.id,
    p_customer_id: connection.external_account_id,
    p_currency: connection.currency_code,
    p_daily_budget_minor: planRow.daily_budget_minor,
    p_plan_hash: approvalHash,
    p_eu_political_advertising: input.data.euPoliticalAdvertising,
    p_eu_declaration_confirmed: input.data.declarationConfirmed,
    p_terms_accepted: input.data.termsAccepted,
    p_approval_summary: approvalSummary,
  }).maybeSingle()
  if (error || !data) return googleAdsJson({ ok: false, error: 'provider_error' }, 502)
  const result = data as { state?: string; approval_id?: string; plan_version?: number }
  if (result.state !== 'approved' || !result.approval_id) {
    const status = result.state === 'not_found' ? 404 : result.state === 'plan_changed' ? 409 : 400
    return googleAdsJson({ ok: false, error: result.state ?? 'plan_not_approved' }, status)
  }

  const { data: savedAcceptance, error: acceptanceError } = await admin
    .from('ads_google_publish_approvals')
    .update({
      terms_accepted_at: new Date().toISOString(),
      approval_summary: { ...approvalSummary, termsVersion: GOOGLE_ADS_PUBLISH_TERMS_VERSION },
    })
    .eq('id', result.approval_id)
    .eq('user_id', gate.userId)
    .select('id')
    .maybeSingle()
  if (acceptanceError || !savedAcceptance) {
    return googleAdsJson({ ok: false, error: 'provider_error' }, 502)
  }

  return googleAdsJson({
    ok: true,
    approvalId: result.approval_id,
    approvalHash,
    planVersion: result.plan_version ?? planRow.version,
    approvalSummary,
    euPoliticalAdvertising: input.data.euPoliticalAdvertising,
    requiresValidateOnly: true,
  })
}
