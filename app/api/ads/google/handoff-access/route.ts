import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  googleAdsFeatureEnabled,
  googleAdsJson,
  googleAdsRequestAccess,
} from '@/lib/ads/google-route-utils'

export const dynamic = 'force-dynamic'

const UNAVAILABLE = { state: 'unavailable', eligible: false } as const

/**
 * Tells the public /ads page which action to offer under a scan result:
 * - `signed_out`: no session, offer sign in / sign up.
 * - `needs_connect`: signed in and allowed to connect, but no usable Google Ads account yet.
 * - `ready`: signed in, allowed to publish and has a usable account (`eligible`, with `connectionId`).
 * - `unavailable`: flag off, no access for this account, or a lookup failure. One body for
 *   every such reason, so the page reveals nothing about why.
 * The state is only ever about the caller's own session.
 */
export async function GET() {
  if (!googleAdsFeatureEnabled()) return googleAdsJson(UNAVAILABLE)

  let access: Awaited<ReturnType<typeof googleAdsRequestAccess>>
  try {
    access = await googleAdsRequestAccess()
  } catch {
    return googleAdsJson(UNAVAILABLE)
  }
  if (!access) return googleAdsJson({ state: 'signed_out', eligible: false })

  const userId = access.userId
  if (!userId || !access.decision.canConnect) return googleAdsJson(UNAVAILABLE)
  if (!checkRateLimit(`google-ads-handoff-access:${userId}`, 60, 60_000).allowed) return googleAdsJson(UNAVAILABLE)

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
  if (error) return googleAdsJson(UNAVAILABLE)
  if (!data) return googleAdsJson({ state: 'needs_connect', eligible: false })
  if (!access.decision.canPublish) return googleAdsJson(UNAVAILABLE)
  return googleAdsJson({ state: 'ready', eligible: true, connectionId: data.id })
}
