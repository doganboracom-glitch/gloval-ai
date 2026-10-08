import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  isPlanCreditDryRun,
  sweepPlanCredits,
  type GrantResult,
  type LedgerEntry,
  type PlanCreditStore,
  type PlanCreditSubscription,
  type PlanCreditSweepSummary,
} from '@/lib/plan-credit-sweep'

type PlanEmbed = { code: string | null; interval: string | null; product_category: string | null }

type SubscriptionDbRow = {
  id: string
  user_id: string
  status: string
  current_period_start: string | null
  current_period_end: string | null
  billing_plans: PlanEmbed | PlanEmbed[] | null
}

const COLUMNS =
  'id, user_id, status, current_period_start, current_period_end, billing_plans!billing_subscriptions_plan_id_fkey(code, interval, product_category)'

function toSubscription(row: SubscriptionDbRow): PlanCreditSubscription {
  const plan = Array.isArray(row.billing_plans) ? row.billing_plans[0] : row.billing_plans
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    planCode: plan?.code ?? null,
    productCategory: plan?.product_category ?? null,
    interval: plan?.interval ?? null,
    periodStart: row.current_period_start,
    periodEnd: row.current_period_end,
  }
}

export const supabasePlanCreditStore: PlanCreditStore = {
  async listPage(afterId, limit) {
    let query = createAdminClient()
      .from('billing_subscriptions')
      .select(COLUMNS)
      .eq('status', 'active')
      .order('id', { ascending: true })
      .limit(limit)
    if (afterId) query = query.gt('id', afterId)
    const { data, error } = await query
    if (error) throw new Error('plan_credit_store_read_failed')
    return ((data ?? []) as unknown as SubscriptionDbRow[]).map(toSubscription)
  },

  async findGrantedReasons(reasons) {
    if (reasons.length === 0) return new Set()
    const { data, error } = await createAdminClient()
      .from('ai_credit_transactions')
      .select('reason')
      .in('reason', reasons)
    if (error) throw new Error('plan_credit_store_read_failed')
    return new Set((data ?? []).map((row) => row.reason as string))
  },

  async loadLedger(userId) {
    const { data, error } = await createAdminClient()
      .from('ai_credit_transactions')
      .select('kind, amount, reason, created_at')
      .eq('user_id', userId)
    if (error) throw new Error('plan_credit_store_read_failed')
    return (data ?? []) as LedgerEntry[]
  },

  async grant({ userId, subscriptionId, periodRef, rule }) {
    const { data, error } = await createAdminClient()
      .rpc('grant_plan_period_credits', {
        p_user_id: userId,
        p_scope: subscriptionId,
        p_period_ref: periodRef,
        p_first_credits: rule.firstCredits,
        p_period_credits: rule.periodCredits,
        p_max_balance: rule.maxBalance,
        p_expire_unused: rule.expireUnused,
      })
      .maybeSingle()
    if (error || !data) throw new Error('plan_credit_grant_failed')
    // The generated types do not know this RPC's row shape.
    const row = data as { granted: number; expired: number; balance: number; duplicate: boolean; first_period: boolean }
    const result: GrantResult = {
      granted: row.granted,
      expired: row.expired,
      balance: row.balance,
      duplicate: row.duplicate,
      firstPeriod: row.first_period,
    }
    return result
  },
}

/** One subscription in the sweep's shape (used by the instant grant). */
export async function loadPlanCreditSubscription(subscriptionId: string): Promise<PlanCreditSubscription | null> {
  const { data, error } = await createAdminClient()
    .from('billing_subscriptions')
    .select(COLUMNS)
    .eq('id', subscriptionId)
    .maybeSingle()
  if (error) throw new Error('plan_credit_store_read_failed')
  return data ? toSubscription(data as unknown as SubscriptionDbRow) : null
}

/** Cron entry point. Writes nothing unless AI_CREDIT_GRANT_DRY_RUN is exactly "false". */
export async function runPlanCreditSweep(options: { deadlineMs?: number } = {}): Promise<PlanCreditSweepSummary> {
  return sweepPlanCredits({
    store: supabasePlanCreditStore,
    dryRun: isPlanCreditDryRun(process.env.AI_CREDIT_GRANT_DRY_RUN),
    deadlineMs: options.deadlineMs,
  })
}
