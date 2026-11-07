'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AdsProductSwitch } from '@/components/ads/ads-product-switch'
import { AdsBetaBadge } from '@/components/ads/ads-page-client'
import { AdsTabList, ADS_TAB_IDS, type AdsTabId } from '@/components/ads/ads-tabs'
import { AdsPlatformSelector } from '@/components/ads/ads-platform-selector'
import { AdsPlatformComingSoon } from '@/components/ads/ads-platform-coming-soon'
import { ADS_PLATFORM_TABS, ADS_PLATFORM_WORKSPACES } from '@/components/ads/ads-platform-workspaces'
import type { AdsDashboardData } from '@/components/ads/ads-workspace-types'
import { ADS_PATH } from '@/lib/ads/feature-flag'
import {
  buildDashboardViewUrl,
  getAdsPlatformBySlug,
  isFacebookHashRemnant,
  type AdsPlatformDefinition,
  type AdsPlatformGate,
  type AdsPlatformSlug,
} from '@/lib/ads/platforms'

type AdsDashboardClientProps = AdsDashboardData & {
  initialPlatformSlug: AdsPlatformSlug
  openGates: readonly AdsPlatformGate[]
}

function isTabId(value: string): value is AdsTabId {
  return (ADS_TAB_IDS as readonly string[]).includes(value)
}

export function AdsDashboardClient({
  initialPlatformSlug,
  openGates,
  address,
  initialPlanId = null,
  connections,
  pendingFlowId,
  googleStatus,
  publishEnabled,
  killSwitchEnabled,
  termsAcceptedAt,
  metaConnections,
  metaPendingFlowId,
  metaStatus,
  metaMissingScopes,
}: AdsDashboardClientProps) {
  const { t, lang } = useLanguage()
  const isTr = lang === 'tr'
  const copy = t.ads

  const [platformSlug, setPlatformSlug] = useState<AdsPlatformSlug>(initialPlatformSlug)
  const [tab, setTab] = useState<AdsTabId>(() =>
    pendingFlowId || googleStatus || metaPendingFlowId || metaStatus ? 'settings' : initialPlanId ? 'plans' : 'overview',
  )

  useEffect(() => {
    if (isFacebookHashRemnant(window.location.hash)) {
      const landingTab: AdsTabId =
        pendingFlowId || googleStatus || metaPendingFlowId || metaStatus ? 'settings' : initialPlanId ? 'plans' : 'overview'
      window.history.replaceState(null, '', buildDashboardViewUrl(window.location.search, initialPlatformSlug, landingTab))
      return
    }
    const fromHash = window.location.hash.replace('#', '')
    if (isTabId(fromHash) && !pendingFlowId && !googleStatus && !metaPendingFlowId && !metaStatus) setTab(fromHash)
  }, [pendingFlowId, googleStatus, metaPendingFlowId, metaStatus, initialPlanId, initialPlatformSlug])

  const syncUrl = useCallback((slug: AdsPlatformSlug, nextTab: AdsTabId) => {
    window.history.replaceState(null, '', buildDashboardViewUrl(window.location.search, slug, nextTab))
  }, [])

  const changeTab = useCallback((next: AdsTabId) => {
    setTab(next)
    syncUrl(platformSlug, next)
  }, [platformSlug, syncUrl])

  const changePlatform = useCallback((platform: AdsPlatformDefinition) => {
    setPlatformSlug(platform.slug)
    syncUrl(platform.slug, tab)
  }, [syncUrl, tab])

  const platform = getAdsPlatformBySlug(platformSlug)
  const Workspace = platform ? ADS_PLATFORM_WORKSPACES[platform.id] : undefined
  const data: AdsDashboardData = {
    address,
    initialPlanId,
    connections,
    pendingFlowId,
    googleStatus,
    publishEnabled,
    killSwitchEnabled,
    termsAcceptedAt,
    metaConnections,
    metaPendingFlowId,
    metaStatus,
    metaMissingScopes,
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10">
        <div>
          <Link
            href={ADS_PATH}
            className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
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

        <AdsPlatformSelector
          copy={copy}
          activeSlug={platformSlug}
          openGates={openGates}
          onSelect={changePlatform}
        />

        {Workspace ? (
          <div>
            <AdsTabList active={tab} onChange={changeTab} isTr={isTr} tabs={platform ? ADS_PLATFORM_TABS[platform.id] : undefined} />
            <Workspace tab={tab} onTabChange={changeTab} data={data} />
          </div>
        ) : platform ? (
          <AdsPlatformComingSoon platform={platform} copy={copy} reason="coming_soon" />
        ) : null}
      </main>
      <SiteFooter />
    </div>
  )
}
