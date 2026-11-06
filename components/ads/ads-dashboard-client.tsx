'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AdsProductSwitch } from '@/components/ads/ads-product-switch'
import { AdsBetaBadge } from '@/components/ads/ads-page-client'
import { GoogleAdsDashboard, type GoogleAdsConnectionView } from '@/components/ads/google-ads-dashboard'
import { GoogleAdsWorkspace } from '@/components/ads/google-ads-workspace'
import { GoogleAdsInsights } from '@/components/ads/google-ads-insights'
import { ADS_PATH } from '@/lib/ads/feature-flag'

type AdsDashboardClientProps = {
  address: string | null
  initialPlanId?: string | null
  connections: GoogleAdsConnectionView[]
  pendingFlowId: string | null
  googleStatus: string | null
  publishEnabled: boolean
  killSwitchEnabled: boolean
  termsAcceptedAt: string | null
}

export function AdsDashboardClient({
  address,
  initialPlanId = null,
  connections,
  pendingFlowId,
  googleStatus,
  publishEnabled,
  killSwitchEnabled,
  termsAcceptedAt,
}: AdsDashboardClientProps) {
  const { t } = useLanguage()
  const copy = t.ads

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10">
        <div>
          <Link
            href={ADS_PATH}
            className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {copy.backToAds}
          </Link>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <AdsProductSwitch active="ads" />
              <AdsBetaBadge />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">{copy.dashboardTitle}</h1>
            <p className="text-pretty text-muted-foreground">{copy.dashboardSubtitle}</p>
          </div>
        </div>

        <GoogleAdsDashboard
          connections={connections}
          pendingFlowId={pendingFlowId}
          oauthStatus={googleStatus}
        />

        <GoogleAdsInsights connections={connections} />

        <GoogleAdsWorkspace
          enabled
          publishEnabled={publishEnabled}
          killSwitchEnabled={killSwitchEnabled}
          initialTermsAccepted={Boolean(termsAcceptedAt)}
          termsAcceptedAt={termsAcceptedAt}
          connections={connections}
          initialAddress={address}
          initialPlanId={initialPlanId}
        />
      </main>
      <SiteFooter />
    </div>
  )
}
