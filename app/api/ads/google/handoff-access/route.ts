import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { resolveGoogleAdsPublishAccess } from '@/lib/ads/env'
import {
  googleAdsConnectAllowed,
  googleAdsFeatureEnabled,
  googleAdsJson,
  googleAdsUserId,
} from '@/lib/ads/google-route-utils'

export const dynamic = 'force-dynamic'

const NOT_ELIGIBLE = { eligible: false } as const

/**
 * Tells the public /ads page whether to offer "prepare for Google Ads". Every
 * reason for saying no (signed out, flag off, no publish access, no usable
 * account) returns the same body, so the page reveals nothing about why.
 */
export async function GET() {
  if (!googleAdsFeatureEnabled()) return googleAdsJson(NOT_ELIGIBLE)

  let userId: string | null
  try {
    userId = await googleAdsUserId()
  } catch {
    return googleAdsJson(NOT_ELIGIBLE)
  }
  if (!userId || !googleAdsConnectAllowed(userId) || !resolveGoogleAdsPublishAccess(userId)) {
    return googleAdsJson(NOT_ELIGIBLE)
  }
  if (!checkRateLimit(`google-ads-handoff-access:${userId}`, 60, 60_000).allowed) return googleAdsJson(NOT_ELIGIBLE)

  const { data, error } = await createAdminClient()
    .from('ads_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', 'google_ads')
    .eq('status', 'active')
    .eq('is_manager', false)
    .not('currency_code', 'is', null)
    .limit(1)
    .maybeSingle()
  if (error || !data) return googleAdsJson(NOT_ELIGIBLE)
  return googleAdsJson({ eligible: true, connectionId: data.id })
}
