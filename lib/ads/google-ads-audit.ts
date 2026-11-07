import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  googleErrorFailureCode,
  sanitizeGoogleErrorDetails,
  type GoogleErrorDetail,
} from '@/lib/ads/google-error-detail'
import type { GoogleAdsReadQuery } from '@/lib/ads/google-read-error'

const READ_REJECTION_THROTTLE_MS = 10 * 60 * 1000
const READ_REJECTION_THROTTLE_MAX_KEYS = 500
const recentReadRejections = new Map<string, number>()

export function resetGoogleAdsReadRejectionThrottle(): void {
  recentReadRejections.clear()
}

/**
 * Records that Google rejected a read query (campaign state, keywords, ad policy, performance) so admins can see why a
 * section is empty. Throttled per user/query/reason so repeated dashboard refreshes cannot flood the log.
 * Never throws: auditing must not change the outcome of the read.
 */
export async function recordGoogleAdsReadRejection(input: {
  userId: string
  connectionId: string | null
  query: GoogleAdsReadQuery
  httpStatus: number
  googleErrors: readonly GoogleErrorDetail[]
}): Promise<void> {
  const googleErrors = sanitizeGoogleErrorDetails(input.googleErrors)
  const reason = googleErrorFailureCode(googleErrors, 'google_read_rejected')
  const throttleKey = `${input.userId}:${input.query}:${reason}`
  const now = Date.now()
  const last = recentReadRejections.get(throttleKey)
  if (last !== undefined && now - last < READ_REJECTION_THROTTLE_MS) return
  if (recentReadRejections.size >= READ_REJECTION_THROTTLE_MAX_KEYS) recentReadRejections.clear()
  recentReadRejections.set(throttleKey, now)

  try {
    const admin = createAdminClient()
    const { error } = await admin.from('ads_actions').insert({
      user_id: input.userId,
      plan_id: null,
      connection_id: input.connectionId,
      actor: 'system',
      action_type: 'google_ads_read_rejected',
      target: { operation: 'read', query: input.query, reason_code: reason },
      after_state: {
        reason_code: reason,
        query: input.query,
        http_status: input.httpStatus,
        ...(googleErrors.length ? { googleErrors } : {}),
      },
      reversible: false,
      status: 'failed',
      failure_reason: reason,
      applied_at: new Date().toISOString(),
    })
    if (error) console.error('[google-ads] read rejection audit insert failed', { query: input.query })
  } catch {
    return
  }
}

export async function recordGoogleAdsPolicyBlock(input: {
  userId: string
  planId?: string | null
  connectionId?: string | null
  reason: string
  operation: string
  /** Safe Google error summary; stored in `after_state.googleErrors` (jsonb, no migration needed). */
  googleErrors?: readonly GoogleErrorDetail[]
  /** Generic failure code (e.g. `provider_error`) when `reason` carries the more specific Google code. */
  baseReason?: string
}): Promise<void> {
  const admin = createAdminClient()
  const googleErrors = sanitizeGoogleErrorDetails(input.googleErrors)
  try {
    const { error } = await admin.from('ads_actions').insert({
      user_id: input.userId,
      plan_id: input.planId ?? null,
      connection_id: input.connectionId ?? null,
      actor: 'system',
      action_type: 'google_ads_policy_blocked',
      target: { operation: input.operation, reason_code: input.reason },
      after_state: {
        reason_code: input.reason,
        ...(input.baseReason ? { base_reason: input.baseReason } : {}),
        ...(googleErrors.length ? { googleErrors } : {}),
      },
      reversible: false,
      status: 'failed',
      failure_reason: input.reason,
      applied_at: new Date().toISOString(),
    })
    if (error) console.error('[google-ads] failure audit insert failed', { operation: input.operation })
  } catch {
    return
  }
}
