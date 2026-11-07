'use client'

import { useLanguage } from '@/components/language-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AdsTabPanel } from '@/components/ads/ads-tabs'
import type { AdsWorkspaceProps } from '@/components/ads/ads-workspace-types'
import { MetaAdsSettings } from '@/components/ads/meta-ads-settings'
import { MetaAdsInsights } from '@/components/ads/meta-ads-insights'
import { MetaPublishPanel } from '@/components/ads/meta-publish-panel'
import { metaAccountStatusLabel } from '@/lib/ads/meta-ads-shared'

export function MetaAdsPlatformWorkspace({ tab, onTabChange, data }: AdsWorkspaceProps) {
  const { lang } = useLanguage()
  const isTr = lang === 'tr'
  const { metaConnections, metaPendingFlowId, metaStatus, metaMissingScopes } = data
  const activeConnections = metaConnections.filter((connection) => connection.status === 'active')

  return (
    <>
      <AdsTabPanel tab="overview" active={tab}>
        <section className="flex flex-col gap-4" aria-labelledby="meta-overview-title">
          <div className="flex flex-col gap-1">
            <h2 id="meta-overview-title" className="text-xl font-semibold tracking-tight">
              {isTr ? 'Meta hesaplarınız' : 'Your Meta accounts'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isTr
                ? `${activeConnections.length} bağlı reklam hesabı`
                : `${activeConnections.length} connected ad accounts`}
            </p>
          </div>

          {activeConnections.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {activeConnections.map((connection) => (
                <li key={connection.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{connection.name ?? connection.externalAccountId}</span>
                    {connection.accountStatus !== null ? (
                      <Badge variant="secondary">{metaAccountStatusLabel(connection.accountStatus, isTr).label}</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {[connection.pageName, connection.instagramAccountName, connection.currency].filter(Boolean).join(' · ') || connection.externalAccountId}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-6">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {isTr
                  ? 'Başlamak için Ayarlar sekmesinden Meta reklam hesabınızı bağlayın.'
                  : 'To begin, connect your Meta ad account from the Settings tab.'}
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => onTabChange('settings')}>
                {isTr ? 'Hesap bağla' : 'Connect account'}
              </Button>
            </div>
          )}
        </section>
      </AdsTabPanel>

      <AdsTabPanel tab="plans" active={tab}>
        <MetaPublishPanel connections={metaConnections} publishEnabled={data.publishEnabled} />
      </AdsTabPanel>

      <AdsTabPanel tab="reports" active={tab}>
        <MetaAdsInsights connections={metaConnections} />
      </AdsTabPanel>

      <AdsTabPanel tab="settings" active={tab}>
        <MetaAdsSettings
          connections={metaConnections}
          pendingFlowId={metaPendingFlowId}
          status={metaStatus}
          missingScopes={metaMissingScopes}
        />
      </AdsTabPanel>
    </>
  )
}
