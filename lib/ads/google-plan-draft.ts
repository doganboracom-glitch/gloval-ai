import 'server-only'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveGoogleAdsPublishDailyBudgetCapMinor } from '@/lib/ads/env'
import { buildPlanSuggestion, type PlanSuggestion } from '@/lib/ads/plan-suggestion'
import { buildGoogleAdsApprovalSummary } from '@/lib/ads/google-ads-publish-plan'
import type { AdsRpcClient } from '@/lib/ads/credits'

export const suggestBodySchema = z.object({
  connectionId: z.string().uuid(),
  result: z.unknown(),
})

export type DraftConnection = { id: string; currency: string }
export type DraftFailure = { error: string; status: number }

export async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export async function loadDraftConnection(
  userId: string,
  connectionId: string,
): Promise<{ ok: true; connection: DraftConnection } | ({ ok: false } & DraftFailure)> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ads_connections')
    .select('id,currency_code,is_manager,status')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .eq('platform', 'google_ads')
    .maybeSingle()
  if (error) return { ok: false, error: 'provider_error', status: 502 }
  if (!data || data.status !== 'active') return { ok: false, error: 'connection_not_found', status: 404 }
  if (data.is_manager) return { ok: false, error: 'manager_account', status: 400 }
  if (!data.currency_code) return { ok: false, error: 'currency_mismatch', status: 400 }
  return { ok: true, connection: { id: data.id, currency: data.currency_code } }
}

export function suggestForConnection(
  scanResult: unknown,
  connection: DraftConnection,
): { ok: true; suggestion: PlanSuggestion } | ({ ok: false } & DraftFailure) {
  const outcome = buildPlanSuggestion(scanResult, {
    currency: connection.currency,
    serverCapMinor: resolveGoogleAdsPublishDailyBudgetCapMinor(connection.currency),
  })
  if (!outcome.ok) {
    const status = outcome.error === 'invalid_request' || outcome.error === 'invalid_publish_plan' ? 400 : 422
    return { ok: false, error: outcome.error, status }
  }
  return { ok: true, suggestion: outcome.suggestion }
}

export async function createDraftFromSuggestion(
  userId: string,
  connection: DraftConnection,
  suggestion: PlanSuggestion,
): Promise<{ ok: true; planId: string; version: number } | ({ ok: false } & DraftFailure)> {
  const { budget, plan } = suggestion
  if (!budget) return { ok: false, error: 'budget_limit_not_configured', status: 503 }
  try {
    buildGoogleAdsApprovalSummary({
      currency: connection.currency,
      dailyBudgetMinor: budget.dailyMinor,
      budgetCapMinor: budget.capMinor,
    })
  } catch {
    return { ok: false, error: 'invalid_budget', status: 400 }
  }

  const rpc = createAdminClient() as unknown as AdsRpcClient
  const { data, error } = await rpc
    .rpc('ads_create_google_ads_plan_draft_e2', {
      p_user_id: userId,
      p_connection_id: connection.id,
      p_plan: plan,
      p_display_name: plan.brand,
      p_sector: plan.sector,
      p_language: plan.language,
      p_daily_budget_minor: budget.dailyMinor,
      p_budget_cap_minor: budget.capMinor,
      p_currency: connection.currency,
    })
    .maybeSingle()
  if (error || !data) return { ok: false, error: 'provider_error', status: 502 }
  const result = data as { state?: string; plan_id?: string; plan_version?: number }
  if (result.state !== 'created' || !result.plan_id) {
    return { ok: false, error: result.state ?? 'invalid_request', status: result.state === 'connection_not_found' ? 404 : 400 }
  }
  return { ok: true, planId: result.plan_id, version: result.plan_version ?? 1 }
}
