import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { PlanCode } from '@/lib/pricing-config'

/**
 * Server-only FREE-plan daily action gate.
 *
 * This is deliberately SEPARATE from the AI credit ledger (`lib/ai-credits.ts`):
 * a FREE user with credits remaining must still be blocked once they've made
 * FREE_DAILY_ACTION_LIMIT AI/edit actions within the last rolling 24h window,
 * counted from their FIRST action in that window. Checked and incremented
 * atomically via the `check_and_increment_free_daily_action` Postgres function
 * (SECURITY DEFINER, service-role only, serialized per-user with
 * `pg_advisory_xact_lock`), so it cannot be bypassed by refreshing, logging
 * out/in, or switching browser/device — the window lives in the
 * `free_daily_usage` table keyed by `user_id`, never in client state.
 *
 * No-op for any plan other than 'free' — paid plans keep their existing AI
 * usage rules unchanged.
 */
export const FREE_DAILY_ACTION_LIMIT = 7

export const FREE_DAILY_LIMIT_ERROR = 'FREE_DAILY_LIMIT_REACHED'

export type FreeDailyLimitCheck =
  | { allowed: true }
  | { allowed: false; actionCount: number; limit: number; resetAt: string }

export async function checkFreeDailyActionLimit(
  userId: string,
  planCode: PlanCode,
): Promise<FreeDailyLimitCheck> {
  if (planCode !== 'free') return { allowed: true }

  const admin = createAdminClient()
  const { data, error } = await admin
    .rpc('check_and_increment_free_daily_action', {
      p_user_id: userId,
      p_limit: FREE_DAILY_ACTION_LIMIT,
    })
    .maybeSingle()

  if (error || !data) {
    // Fail closed: if the usage table/RPC is unreachable, don't silently grant
    // unlimited FREE usage.
    console.error('[free-daily-limit] check failed:', error?.message)
    return {
      allowed: false,
      actionCount: FREE_DAILY_ACTION_LIMIT,
      limit: FREE_DAILY_ACTION_LIMIT,
      resetAt: new Date().toISOString(),
    }
  }

  // The generated Supabase types don't know this RPC's return row shape, so
  // the client falls back to `{}` — cast to the actual row shape the
  // migration defines.
  const row = data as {
    allowed: boolean
    action_count: number
    window_started_at: string
    reset_at: string
  }

  if (row.allowed) return { allowed: true }
  return {
    allowed: false,
    actionCount: row.action_count,
    limit: FREE_DAILY_ACTION_LIMIT,
    resetAt: row.reset_at,
  }
}

/** Standard 429 JSON body shape for a denied FREE daily-limit check. */
export function freeDailyLimitResponseBody(check: {
  actionCount: number
  limit: number
  resetAt: string
}) {
  return {
    error: FREE_DAILY_LIMIT_ERROR,
    actionCount: check.actionCount,
    limit: check.limit,
    resetAt: check.resetAt,
  }
}
