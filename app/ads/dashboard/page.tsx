import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { AdsDashboardClient } from '@/components/ads/ads-dashboard-client'
import { ADS_DASHBOARD_PATH, isAdsFeatureUiEnabled } from '@/lib/ads/feature-flag'
import { isGoogleAdsConnectAllowed, resolveGoogleAdsConnectEnabled } from '@/lib/ads/google-ads-gate'
import { normalizeSiteAddress } from '@/lib/ads/normalize-site-address'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'GLOVAL Ads',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{
  url?: string | string[]
  googleAdsFlow?: string | string[]
  googleAds?: string | string[]
}>

export default async function AdsDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isAdsFeatureUiEnabled() || !resolveGoogleAdsConnectEnabled()) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=${ADS_DASHBOARD_PATH}`)
  if (!isGoogleAdsConnectAllowed(user.id)) notFound()

  const { url, googleAdsFlow, googleAds } = await searchParams
  const raw = Array.isArray(url) ? url[0] : url
  const normalized = raw ? normalizeSiteAddress(raw) : null
  const address = normalized?.ok ? normalized.host : null
  const flowId = Array.isArray(googleAdsFlow) ? googleAdsFlow[0] : googleAdsFlow
  const status = Array.isArray(googleAds) ? googleAds[0] : googleAds

  return <AdsDashboardClient address={address} googleAdsFlowId={flowId} googleAdsStatus={status} />
}
