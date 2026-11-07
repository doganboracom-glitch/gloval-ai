'use client'

import { useCallback, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AdsTabPanel } from '@/components/ads/ads-tabs'
import type { AdsWorkspaceProps } from '@/components/ads/ads-workspace-types'
import { GoogleAdsDashboard } from '@/components/ads/google-ads-dashboard'
import { GoogleAdsWorkspace, type AdsPlanSummary } from '@/components/ads/google-ads-workspace'
import { GoogleAdsInsights } from '@/components/ads/google-ads-insights'
import { GoogleAdsCampaignManager } from '@/components/ads/google-ads-campaign-manager'

function formatBudget(minor: number | null, currency: string, isTr: boolean) {
  if (!minor || minor <= 0) return '—'
  try {
    const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
    return new Intl.NumberFormat(isTr ? 'tr-TR' : 'en-US', { style: 'currency', currency }).format(minor / 10 ** digits)
  } catch {
    return `${minor / 100} ${currency}`
  }
}

export function GoogleAdsPlatformWorkspace({ tab, onTabChange, data }: AdsWorkspaceProps) {
  const { lang } = useLanguage()
  const isTr = lang === 'tr'
  const {
    address,
    initialPlanId,
    connections,
    pendingFlowId,
    googleStatus,
    publishEnabled,
    killSwitchEnabled,
    termsAcceptedAt,
  } = data

  const [plans, setPlans] = useState<AdsPlanSummary[]>([])
  const [managedPlanId, setManagedPlanId] = useState<string | null>(null)
  const [newPlanSignal, setNewPlanSignal] = useState(0)

  const publishedPlans = useMemo(() => plans.filter((plan) => plan.status === 'published'), [plans])
  const managedPlan = publishedPlans.find((plan) => plan.id === managedPlanId) ?? publishedPlans[0] ?? null
  const activeConnections = connections.filter((connection) => !connection.isManager && connection.status === 'active')

  const openManagement = useCallback((planId: string) => {
    setManagedPlanId(planId)
    onTabChange('management')
  }, [onTabChange])

  const startNewPlan = useCallback(() => {
    setNewPlanSignal((value) => value + 1)
    onTabChange('plans')
  }, [onTabChange])

  return (
    <>
      <AdsTabPanel tab="overview" active={tab}>
        <section className="flex flex-col gap-4" aria-labelledby="ads-overview-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="ads-overview-title" className="text-xl font-semibold tracking-tight">{isTr ? 'Kampanyalarınız' : 'Your campaigns'}</h2>
              <p className="text-sm text-muted-foreground">
                {isTr
                  ? `${activeConnections.length} bağlı hesap · ${publishedPlans.length} yayındaki kampanya · ${plans.length} plan`
                  : `${activeConnections.length} connected accounts · ${publishedPlans.length} live campaigns · ${plans.length} plans`}
              </p>
            </div>
            <Button type="button" size="sm" onClick={startNewPlan}>
              <Plus data-icon="inline-start" aria-hidden="true" />{isTr ? 'Yeni plan' : 'New plan'}
            </Button>
          </div>

          {publishedPlans.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {publishedPlans.map((plan) => (
                <li key={plan.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{plan.name ?? (isTr ? 'Ads kampanyası' : 'Ads campaign')}</span>
                    <Badge variant="secondary">{plan.googleCampaignStatus === 'ENABLED' ? (isTr ? 'Etkin' : 'Enabled') : (isTr ? 'Duraklatıldı' : 'Paused')}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {isTr ? 'Günlük bütçe' : 'Daily budget'}: {formatBudget(plan.googleDailyBudgetMinor ?? plan.dailyBudgetMinor, plan.currency, isTr)}
                  </p>
                  <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => openManagement(plan.id)}>
                    {isTr ? 'Kampanyayı yönet' : 'Manage campaign'}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-6">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {activeConnections.length
                  ? (isTr ? 'Henüz yayında kampanyanız yok. Yapay zekâ ile bir plan hazırlayın, inceleyin ve duraklatılmış olarak yayınlayın.' : 'No live campaigns yet. Draft a plan with AI, review it, and publish it paused.')
                  : (isTr ? 'Başlamak için Ayarlar sekmesinden Google Ads hesabınızı bağlayın.' : 'To begin, connect your Google Ads account from the Settings tab.')}
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => (activeConnections.length ? startNewPlan() : onTabChange('settings'))}>
                {activeConnections.length ? (isTr ? 'İlk planı oluştur' : 'Create the first plan') : (isTr ? 'Hesap bağla' : 'Connect account')}
              </Button>
            </div>
          )}
        </section>
      </AdsTabPanel>

      <AdsTabPanel tab="plans" active={tab}>
        <GoogleAdsWorkspace
          enabled
          publishEnabled={publishEnabled}
          killSwitchEnabled={killSwitchEnabled}
          initialTermsAccepted={Boolean(termsAcceptedAt)}
          termsAcceptedAt={termsAcceptedAt}
          connections={connections}
          initialAddress={address}
          initialPlanId={initialPlanId}
          newPlanSignal={newPlanSignal}
          onPlansChange={setPlans}
          onOpenManagement={openManagement}
        />
      </AdsTabPanel>

      <AdsTabPanel tab="management" active={tab}>
        {publishedPlans.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={isTr ? 'Kampanya seçimi' : 'Choose campaign'}>
            {publishedPlans.map((plan) => (
              <Button
                key={plan.id}
                type="button"
                size="sm"
                variant={managedPlan?.id === plan.id ? 'secondary' : 'outline'}
                aria-pressed={managedPlan?.id === plan.id}
                onClick={() => setManagedPlanId(plan.id)}
              >
                {plan.name ?? plan.externalCampaignId ?? plan.id.slice(0, 8)}
              </Button>
            ))}
          </div>
        ) : null}
        <GoogleAdsCampaignManager
          key={managedPlan?.id ?? 'none'}
          plan={managedPlan ? { id: managedPlan.id, status: managedPlan.status, version: managedPlan.version } : null}
          hasConnection={activeConnections.length > 0}
          currency={managedPlan?.currency ?? activeConnections[0]?.currency ?? 'TRY'}
          isTr={isTr}
        />
      </AdsTabPanel>

      <AdsTabPanel tab="reports" active={tab}>
        <GoogleAdsInsights connections={connections} />
      </AdsTabPanel>

      <AdsTabPanel tab="settings" active={tab}>
        <GoogleAdsDashboard
          connections={connections}
          pendingFlowId={pendingFlowId}
          oauthStatus={googleStatus}
        />
      </AdsTabPanel>
    </>
  )
}
