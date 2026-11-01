import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { AdsDashboardClient } from '@/components/ads/ads-dashboard-client'
import { ADS_DASHBOARD_PATH, isAdsFeatureUiEnabled } from '@/lib/ads/feature-flag'
import { normalizeSiteAddress } from '@/lib/ads/normalize-site-address'
import { listGoogleAdsConnectionsForUser } from '@/lib/ads/google-connections'
import { googleAdsConnectAllowed } from '@/lib/ads/google-route-utils'
import { AuthUnavailableNotice } from '@/components/auth-unavailable-notice'
import { createClient } from '@/lib/supabase/server'
import { getPageAuthState } from '@/lib/supabase/page-auth'

export const metadata: Metadata = {
  title: 'Google Ads Dashboard | GLOVAL',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{
  url?: string | string[]
  google?: string | string[]
  google_flow?: string | string[]
}>

function firstValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export default async function AdsDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isAdsFeatureUiEnabled()) notFound()

  const supabase = await createClient()
  const authState = await getPageAuthState(supabase)
  if (authState.kind === 'unavailable') return <AuthUnavailableNotice />
  if (authState.kind === 'unauthenticated') redirect(`/auth/login?next=${ADS_DASHBOARD_PATH}`)
  const { user } = authState
  if (!googleAdsConnectAllowed(user.id)) notFound()

  const params = await searchParams
  const rawAddress = firstValue(params.url)
  const normalized = rawAddress ? normalizeSiteAddress(rawAddress) : null
  const address = normalized?.ok ? normalized.host : null
  const connections = await listGoogleAdsConnectionsForUser(user.id).catch(() => [])

  return (
    <AdsDashboardClient
      address={address}
      connections={connections}
      pendingFlowId={firstValue(params.google_flow)}
      googleStatus={firstValue(params.google)}
    />
  )
}
