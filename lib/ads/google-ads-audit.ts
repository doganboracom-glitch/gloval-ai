import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeGoogleErrorDetails, type GoogleErrorDetail } from '@/lib/ads/google-error-detail'

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
