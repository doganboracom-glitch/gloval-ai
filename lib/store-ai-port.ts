import 'server-only'

import { getCreditBalance } from '@/lib/ai-credits'
import { createAdminClient } from '@/lib/supabase/admin'
import { STORE_AI_COSTS, STORE_AI_LIMITS, freeCycleFor } from '@/lib/store-ai-constants'
import type { BeginOutcome, BeginResult, FinishStatus, StoreAiPort } from '@/lib/store-ai-engine'

const OUTCOMES: readonly BeginOutcome[] = ['started', 'replay', 'busy', 'rate_minute', 'rate_daily', 'insufficient']

type BeginRow = {
  outcome: string
  out_attempt_id: string | null
  out_attempt_no: number | null
  out_charged: number | null
  out_balance: number | null
}

/**
 * Production port: the `store_ai_*` SQL functions of scripts/039 plus the
 * existing credit ledger helpers. Service-role only; never import client-side.
 */
export function createStoreAiPort(): StoreAiPort {
  const admin = createAdminClient()

  return {
    async begin(input): Promise<BeginResult> {
      const { data, error } = await admin
        .rpc('store_ai_begin', {
          p_user_id: input.userId,
          p_project_id: input.projectId,
          p_product_key: input.productKey,
          p_kind: input.kind,
          p_request_id: input.requestId,
          p_cost: STORE_AI_COSTS[input.kind],
          p_free_cycle: freeCycleFor(input.kind),
          p_per_minute: STORE_AI_LIMITS.perMinute,
          p_concurrent: STORE_AI_LIMITS.concurrent,
          p_daily: STORE_AI_LIMITS.daily,
          p_stale_seconds: STORE_AI_LIMITS.staleSeconds,
        })
        .maybeSingle()
      if (error || !data) throw new Error(error?.message ?? 'store_ai_begin returned no row')

      const row = data as BeginRow
      if (!OUTCOMES.includes(row.outcome as BeginOutcome)) throw new Error(`unknown outcome ${row.outcome}`)
      return {
        outcome: row.outcome as BeginOutcome,
        attemptId: row.out_attempt_id,
        attemptNo: row.out_attempt_no ?? 0,
        charged: row.out_charged ?? 0,
        balance: row.out_balance ?? 0,
      }
    },

    async finish(attemptId, success): Promise<FinishStatus> {
      const { data, error } = await admin.rpc('store_ai_finish', { p_attempt_id: attemptId, p_success: success })
      if (error) throw new Error(error.message)
      return data === 'succeeded' ? 'succeeded' : data === 'not_found' ? 'not_found' : 'failed'
    },

    async resetSeries(projectId, productKey, kind) {
      const { error } = await admin.rpc('store_ai_reset_series', {
        p_project_id: projectId,
        p_product_key: productKey,
        p_kind: kind,
      })
      if (error) throw new Error(error.message)
    },

    async readSucceededCount(projectId, productKey, kind) {
      const { data, error } = await admin
        .from('store_ai_series')
        .select('succeeded_count')
        .eq('project_id', projectId)
        .eq('product_key', productKey)
        .eq('kind', kind)
        .maybeSingle()
      // Missing tables (script not applied yet) read as "no history" so the UI still loads.
      if (error || !data) return 0
      return (data.succeeded_count as number) ?? 0
    },

    async recentCount(userId, kind, windowMs) {
      const since = new Date(Date.now() - windowMs).toISOString()
      const { count, error } = await admin
        .from('store_ai_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('kind', kind)
        .gt('created_at', since)
      if (error) throw new Error(error.message)
      return count ?? 0
    },

    balance: (userId) => getCreditBalance(userId),

    async findProductProject(productKey) {
      const { data } = await admin.from('ecommerce_products').select('project_id').eq('id', productKey).maybeSingle()
      return (data?.project_id as string | undefined) ?? null
    },
  }
}
