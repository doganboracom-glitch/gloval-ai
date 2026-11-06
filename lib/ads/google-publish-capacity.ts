import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import { recordGoogleAdsPolicyBlock } from '@/lib/ads/google-ads-audit'
import type { GoogleAdsPublishLimits } from '@/lib/ads/env'

type CapacityReservation = { actionId: string }

export async function reserveGoogleAdsPublishCapacity(input: {
  userId: string
  planId: string
  connectionId: string
  requestId: string
  limits: GoogleAdsPublishLimits
}): Promise<CapacityReservation> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('ads_reserve_google_ads_publish_capacity', {
    p_user_id: input.userId,
    p_plan_id: input.planId,
    p_connection_id: input.connectionId,
    p_request_id: input.requestId,
    p_max_active_campaigns_per_user: input.limits.maxActiveCampaignsPerUser,
    p_daily_attempts_per_user: input.limits.dailyAttemptsPerUser,
    p_daily_attempts_global: input.limits.dailyAttemptsGlobal,
  })

  if (error) {
    await recordGoogleAdsPolicyBlock({
      userId: input.userId,
      planId: input.planId,
      connectionId: input.connectionId,
      reason: 'quota_check_failed',
      operation: 'publish',
    })
    throw new GoogleAdsError('quota_check_failed')
  }

  const row = Array.isArray(data) ? data[0] : data
  const result = row as { state?: string; action_id?: string } | null
  if (result?.state === 'user_daily_limit') throw new GoogleAdsError('user_publish_limit_reached')
  if (result?.state === 'global_daily_limit') throw new GoogleAdsError('global_publish_limit_reached')
  if (result?.state === 'active_campaign_limit') throw new GoogleAdsError('active_campaign_limit_reached')
  if (result?.state !== 'reserved' || typeof result.action_id !== 'string') {
    throw new GoogleAdsError('quota_check_failed')
  }

  return { actionId: result.action_id }
}

export async function finishGoogleAdsPublishCapacity(input: {
  userId: string
  actionId: string
  outcome: 'success' | 'failure'
  reasonCode?: string
}): Promise<void> {
  const admin = createAdminClient()
  try {
    await admin.rpc('ads_finish_google_ads_publish_capacity', {
      p_user_id: input.userId,
      p_action_id: input.actionId,
      p_outcome: input.outcome,
      p_reason_code: input.reasonCode ?? null,
    })
  } catch {
    return
  }
}
