import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { AdsDashboardClient } from '@/components/ads/ads-dashboard-client'
import { ADS_DASHBOARD_PATH, isAdsFeatureUiEnabled } from '@/lib/ads/feature-flag'
import { normalizeSiteAddress } from '@/lib/ads/normalize-site-address'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'GLOVAL Ads',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ url?: string | string[] }>

export default async function AdsDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isAdsFeatureUiEnabled()) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=${ADS_DASHBOARD_PATH}`)

  const { url } = await searchParams
  const raw = Array.isArray(url) ? url[0] : url
  const normalized = raw ? normalizeSiteAddress(raw) : null
  const address = normalized?.ok ? normalized.host : null

  return <AdsDashboardClient address={address} />
}
