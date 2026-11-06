import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export async function recordGoogleAdsPolicyBlock(input: {
  userId: string
  planId?: string | null
  connectionId?: string | null
  reason: string
  operation: string
}): Promise<void> {
  const admin = createAdminClient()
  try {
    await admin.from('ads_actions').insert({
      user_id: input.userId,
      plan_id: input.planId ?? null,
      connection_id: input.connectionId ?? null,
      actor: 'system',
      action_type: 'google_ads_policy_blocked',
      target: { operation: input.operation, reason_code: input.reason },
      after_state: { reason_code: input.reason },
      reversible: false,
      status: 'failed',
      failure_reason: input.reason,
      applied_at: new Date().toISOString(),
    })
  } catch {
    return
  }
}
