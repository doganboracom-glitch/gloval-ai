import { createAdminClient } from '@/lib/supabase/admin'
import { recordGoogleAdsPolicyBlock } from '@/lib/ads/google-ads-audit'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import type { GoogleAdsPublishLimits } from '@/lib/ads/env'

export type GoogleAdsPublishCapacityOutcome = 'success' | 'failure'

export async function reserveGoogleAdsPublishCapacity(input: {
  userId: string
  planId: string
  connectionId: string
  requestId: string
  limits: GoogleAdsPublishLimits
}): Promise<{ actionId: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('ads_reserve_google_ads_publish_capacity_v2', {
    p_user_id: input.userId,
    p_plan_id: input.planId,
    p_connection_id: input.connectionId,
    p_request_id: input.requestId,
    p_daily_attempts_per_user: input.limits.dailyAttemptsPerUser,
    p_daily_attempts_global: input.limits.dailyAttemptsGlobal,
  })

  if (error) {
    await recordGoogleAdsPolicyBlock({
      userId: input.userId,
      planId: input.planId,
      connectionId: input.connectionId,
      reason: 'quota_check_failed',
      operation: 'publish_capacity',
    })
    throw new GoogleAdsError('quota_check_failed')
  }

  const result = data?.[0] as { state?: string; action_id?: string | null } | undefined
  if (result?.state === 'user_publish_limit_reached') {
    throw new GoogleAdsError('user_publish_limit_reached')
  }
  if (result?.state === 'global_publish_limit_reached') {
    throw new GoogleAdsError('global_publish_limit_reached')
  }
  if (result?.state !== 'reserved' || !result.action_id) {
    await recordGoogleAdsPolicyBlock({
      userId: input.userId,
      planId: input.planId,
      connectionId: input.connectionId,
      reason: 'quota_check_failed',
      operation: 'publish_capacity',
    })
    throw new GoogleAdsError('quota_check_failed')
  }

  return { actionId: result.action_id }
}

export async function finishGoogleAdsPublishCapacity(input: {
  userId: string
  actionId: string
  outcome: GoogleAdsPublishCapacityOutcome
  reasonCode?: string
}): Promise<void> {
  const admin = createAdminClient()
  try {
    await admin.rpc('ads_finish_google_ads_publish_capacity_v2', {
      p_user_id: input.userId,
      p_action_id: input.actionId,
      p_outcome: input.outcome,
      p_reason_code: input.reasonCode ?? null,
    })
  } catch {
    return
  }
}
