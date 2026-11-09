import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { AdsDashboardClient } from '@/components/ads/ads-dashboard-client'
import { ADS_DASHBOARD_PATH, isAdsFeatureUiEnabled } from '@/lib/ads/feature-flag'
import { normalizeSiteAddress } from '@/lib/ads/normalize-site-address'
import { listGoogleAdsConnectionsForUser } from '@/lib/ads/google-connections'
import { resolveGoogleAdsAccess, resolveGoogleAdsKillSwitch, resolveMetaAdsAccess } from '@/lib/ads/env'
import { listMetaConnectionsForUser } from '@/lib/ads/meta-connections'
import { META_UUID_PATTERN } from '@/lib/ads/meta-route-utils'
import { resolveDashboardPlatform, resolveRequestedPlatformSlug } from '@/lib/ads/platforms'
import { openGatesForUser } from '@/lib/ads/viewer-access'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { GOOGLE_ADS_PUBLISH_TERMS_VERSION } from '@/lib/ads/google-terms'
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
  meta?: string | string[]
  meta_flow?: string | string[]
  meta_missing?: string | string[]
  plan?: string | string[]
  platform?: string | string[]
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
  const access = resolveGoogleAdsAccess(user.id, {
    emailConfirmed: Boolean(user.email_confirmed_at),
    isAdmin: isAdminEmail(user.email),
  })
  const openGates = openGatesForUser(user)
  if (!access.canConnect) notFound()

  const admin = createAdminClient()
  const { data: acceptedTerms } = await admin
    .from('ads_google_publish_approvals')
    .select('terms_accepted_at,approval_summary')
    .eq('user_id', user.id)
    .contains('approval_summary', { termsVersion: GOOGLE_ADS_PUBLISH_TERMS_VERSION })
    .order('terms_accepted_at', { ascending: true })
    .limit(1)
  const termsAcceptedAt = acceptedTerms?.[0]?.terms_accepted_at ?? null

  const params = await searchParams
  const rawAddress = firstValue(params.url)
  const normalized = rawAddress ? normalizeSiteAddress(rawAddress) : null
  const address = normalized?.ok ? normalized.host : null
  const rawPlanId = firstValue(params.plan)
  const initialPlanId = rawPlanId && /^[0-9a-f-]{36}$/i.test(rawPlanId) ? rawPlanId : null
  const connections = await listGoogleAdsConnectionsForUser(user.id).catch(() => [])
  const metaAccess = resolveMetaAdsAccess(user.id, {
    emailConfirmed: Boolean(user.email_confirmed_at),
    isAdmin: isAdminEmail(user.email),
  })
  const metaVisible = metaAccess.canConnect
  const metaConnections = metaVisible ? await listMetaConnectionsForUser(user.id).catch(() => []) : []
  const metaFlow = firstValue(params.meta_flow)

  return (
    <AdsDashboardClient
      initialPlatformSlug={
        resolveDashboardPlatform(
          resolveRequestedPlatformSlug({
            platform: firstValue(params.platform),
            meta: firstValue(params.meta),
            metaFlow: metaFlow,
          }),
          openGates,
        ).slug
      }
      openGates={openGates}
      metaConnections={metaConnections}
      metaPendingFlowId={metaFlow && META_UUID_PATTERN.test(metaFlow) ? metaFlow : null}
      metaStatus={firstValue(params.meta)}
      metaMissingScopes={firstValue(params.meta_missing)}
      metaManage={{ canManage: metaAccess.canManage, canManageProtective: metaAccess.canManageProtective, canPublish: metaAccess.canPublish }}
      address={address}
      initialPlanId={initialPlanId}
      connections={connections}
      pendingFlowId={firstValue(params.google_flow)}
      googleStatus={firstValue(params.google)}
      publishEnabled={access.canPublish}
      killSwitchEnabled={resolveGoogleAdsKillSwitch()}
      termsAcceptedAt={termsAcceptedAt}
    />
  )
}
