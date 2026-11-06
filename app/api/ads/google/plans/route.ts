import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildGoogleAdsApprovalSummary, parseGoogleAdsPublishPlan } from '@/lib/ads/google-ads-publish-plan'
import type { AdsRpcClient } from '@/lib/ads/credits'
import { googleAdsJson } from '@/lib/ads/google-route-utils'
import { publishGateResponse, requireGoogleAdsPublishRequest } from '@/lib/ads/google-publish-route'

export const dynamic = 'force-dynamic'

const planBodySchema = z.object({
  connectionId: z.string().uuid(),
  plan: z.unknown(),
  dailyBudgetMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
})
const updateBodySchema = planBodySchema.extend({
  planId: z.string().uuid(),
  expectedVersion: z.number().int().min(1),
})

async function readBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function parsePlan(value: unknown) {
  try {
    const plan = parseGoogleAdsPublishPlan(value)
    return {
      ...plan,
      euPoliticalAdvertising: plan.euPoliticalAdvertising ?? 'no',
      euPoliticalDeclarationConfirmed: false,
    }
  } catch {
    return null
  }
}

function budgetError(currency: string, dailyBudgetMinor: number) {
  try {
    buildGoogleAdsApprovalSummary({ currency, dailyBudgetMinor })
  } catch {
    return { error: 'invalid_budget', status: 400 }
  }
  return null
}

export async function GET(request: Request) {
  const gate = await requireGoogleAdsPublishRequest(request)
  if (publishGateResponse(gate)) return gate.response

  const url = new URL(request.url)
  const connectionId = url.searchParams.get('connectionId')
  const admin = createAdminClient()
  let query = admin
    .from('ads_plans')
    .select('id,brand_id,connection_id,status,plan,version,approved_version,approval_summary,approval_id,approval_hash,validation_hash,validated_version,eu_political_advertising,eu_political_declaration_confirmed_at,currency,daily_budget_minor,google_daily_budget_minor,external_campaign_id,google_campaign_status,publish_billing_verified,publish_credit_charged,updated_at')
    .eq('user_id', gate.userId)
    .eq('platform', 'google_ads')
    .order('updated_at', { ascending: false })
  if (connectionId) query = query.eq('connection_id', connectionId)

  const { data, error } = await query
  if (error) return googleAdsJson({ ok: false, error: 'provider_error' }, 502)
  return googleAdsJson({ ok: true, plans: data ?? [] })
}

export async function POST(request: Request) {
  const gate = await requireGoogleAdsPublishRequest(request)
  if (publishGateResponse(gate)) return gate.response

  const raw = await readBody(request)
  const input = planBodySchema.safeParse(raw)
  if (!input.success) return googleAdsJson({ ok: false, error: 'invalid_request' }, 400)
  const plan = parsePlan(input.data.plan)
  if (!plan) return googleAdsJson({ ok: false, error: 'invalid_publish_plan' }, 400)

  const admin = createAdminClient()
  const { data: connection, error: connectionError } = await admin
    .from('ads_connections')
    .select('id,external_account_id,currency_code,is_manager,status')
    .eq('id', input.data.connectionId)
    .eq('user_id', gate.userId)
    .eq('platform', 'google_ads')
    .maybeSingle()
  if (connectionError) return googleAdsJson({ ok: false, error: 'provider_error' }, 502)
  if (!connection || connection.status !== 'active') return googleAdsJson({ ok: false, error: 'connection_not_found' }, 404)
  if (connection.is_manager) return googleAdsJson({ ok: false, error: 'manager_account' }, 400)
  if (!connection.currency_code) return googleAdsJson({ ok: false, error: 'currency_mismatch' }, 400)

  const budgetFailure = budgetError(connection.currency_code, input.data.dailyBudgetMinor)
  if (budgetFailure) return googleAdsJson({ ok: false, error: budgetFailure.error }, budgetFailure.status)

  const rpc = admin as unknown as AdsRpcClient
  const { data, error } = await rpc.rpc('ads_create_google_ads_plan_draft_e2', {
    p_user_id: gate.userId,
    p_connection_id: connection.id,
    p_plan: plan,
    p_display_name: plan.brand,
    p_sector: plan.sector,
    p_language: plan.language,
    p_daily_budget_minor: input.data.dailyBudgetMinor,
    p_currency: connection.currency_code,
  }).maybeSingle()
  if (error || !data) return googleAdsJson({ ok: false, error: 'provider_error' }, 502)
  const result = data as { state?: string; plan_id?: string; plan_version?: number }
  if (result.state !== 'created' || !result.plan_id) {
    const status = result.state === 'connection_not_found' ? 404 : 400
    return googleAdsJson({ ok: false, error: result.state ?? 'invalid_request' }, status)
  }
  return googleAdsJson({ ok: true, planId: result.plan_id, version: result.plan_version ?? 1 }, 201)
}

export async function PATCH(request: Request) {
  const gate = await requireGoogleAdsPublishRequest(request)
  if (publishGateResponse(gate)) return gate.response

  const raw = await readBody(request)
  const input = updateBodySchema.safeParse(raw)
  if (!input.success) return googleAdsJson({ ok: false, error: 'invalid_request' }, 400)
  const plan = parsePlan(input.data.plan)
  if (!plan) return googleAdsJson({ ok: false, error: 'invalid_publish_plan' }, 400)

  const admin = createAdminClient()
  const { data: connection, error: connectionError } = await admin
    .from('ads_connections')
    .select('id,currency_code,is_manager,status')
    .eq('id', input.data.connectionId)
    .eq('user_id', gate.userId)
    .eq('platform', 'google_ads')
    .maybeSingle()
  if (connectionError) return googleAdsJson({ ok: false, error: 'provider_error' }, 502)
  if (!connection || connection.status !== 'active') return googleAdsJson({ ok: false, error: 'connection_not_found' }, 404)
  if (connection.is_manager || !connection.currency_code) return googleAdsJson({ ok: false, error: 'currency_mismatch' }, 400)

  const budgetFailure = budgetError(connection.currency_code, input.data.dailyBudgetMinor)
  if (budgetFailure) return googleAdsJson({ ok: false, error: budgetFailure.error }, budgetFailure.status)

  const { data, error } = await admin
    .from('ads_plans')
    .update({
      connection_id: connection.id,
      plan,
      currency: connection.currency_code,
      daily_budget_minor: input.data.dailyBudgetMinor,
      budget_cap_minor: null,
    })
    .eq('id', input.data.planId)
    .eq('user_id', gate.userId)
    .eq('platform', 'google_ads')
    .eq('version', input.data.expectedVersion)
    .in('status', ['draft', 'failed', 'approved'])
    .select('id,version,status')
    .maybeSingle()
  if (error) return googleAdsJson({ ok: false, error: 'provider_error' }, 502)
  if (!data) return googleAdsJson({ ok: false, error: 'plan_changed' }, 409)
  return googleAdsJson({ ok: true, planId: data.id, version: data.version, status: data.status })
}
