'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { AlertCircle } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  META_RANGES,
  metaAccountStatusLabel,
  metaCampaignStatusLabel,
  metaMinorToMajor,
  type MetaAdsRange,
  type MetaConnectionView,
  type MetaPerformanceReport,
} from '@/lib/ads/meta-ads-shared'

type ReportPayload = { ok: true; report: MetaPerformanceReport; cached: boolean; refreshedAt: string }

const ERROR_COPY: Record<string, [string, string]> = {
  reauth_required: ['Meta erişimi sona ermiş. Ayarlar sekmesinden hesabı yeniden bağlayın.', 'Meta access has expired. Reconnect the account from the Settings tab.'],
  rate_limited: ['Meta istek sınırına ulaşıldı. Biraz sonra tekrar deneyin.', 'Meta rate limit reached. Try again shortly.'],
  kill_switch_active: ['Meta raporları geçici olarak durduruldu.', 'Meta reports are temporarily paused.'],
  provider_error: ['Meta raporu alınamadı. Lütfen tekrar deneyin.', 'The Meta report could not be loaded. Please try again.'],
}

async function fetchReport(url: string): Promise<ReportPayload> {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'provider_error')
  return payload as ReportPayload
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  )
}

export function MetaAdsInsights({ connections }: { connections: MetaConnectionView[] }) {
  const { lang } = useLanguage()
  const isTr = lang === 'tr'
  const locale = isTr ? 'tr-TR' : 'en-US'
  const usable = connections.filter((connection) => connection.status === 'active')
  const [selectedId, setSelectedId] = useState(usable[0]?.id ?? '')
  const [range, setRange] = useState<MetaAdsRange>('7d')
  const connection = usable.find((item) => item.id === selectedId) ?? usable[0] ?? null

  const { data, error, isLoading, isValidating, mutate } = useSWR<ReportPayload>(
    connection ? `/api/ads/meta/dashboard?connectionId=${connection.id}&range=${range}` : null,
    fetchReport,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  if (!connection) {
    return (
      <section className="rounded-xl border border-dashed border-border p-6" aria-labelledby="meta-reports-title">
        <h2 id="meta-reports-title" className="text-lg font-semibold tracking-tight">{isTr ? 'Meta raporları' : 'Meta reports'}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isTr ? 'Meta performansını görmek için Ayarlar sekmesinden Meta reklam hesabınızı bağlayın.' : 'Connect your Meta ad account from the Settings tab to see Meta performance.'}
        </p>
      </section>
    )
  }

  const report = data?.report
  const currency = report?.currency ?? connection.currency
  const money = (value: number) => {
    try {
      return currency ? new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value) : value.toFixed(2)
    } catch {
      return value.toFixed(2)
    }
  }
  const number = (value: number) => new Intl.NumberFormat(locale).format(value)
  const percent = (value: number | null) => (value === null ? '—' : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}%`)
  const state = metaAccountStatusLabel(report?.accountStatus ?? connection.accountStatus, isTr)
  const errorCode = error instanceof Error ? error.message : 'provider_error'

  return (
    <section className="flex flex-col gap-4" aria-labelledby="meta-reports-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="meta-reports-title" className="text-xl font-semibold tracking-tight">{isTr ? 'Meta performansı' : 'Meta performance'}</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{connection.name ?? connection.externalAccountId}</span>
            <Badge variant={state.healthy ? 'secondary' : 'outline'}>{state.label}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {usable.length > 1 ? (
            <select
              aria-label={isTr ? 'Meta hesabı' : 'Meta account'}
              value={connection.id}
              onChange={(event) => setSelectedId(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {usable.map((item) => <option key={item.id} value={item.id}>{item.name ?? item.externalAccountId}</option>)}
            </select>
          ) : null}
          <div role="group" aria-label={isTr ? 'Tarih aralığı' : 'Date range'} className="flex gap-1">
            {META_RANGES.map((value) => (
              <Button key={value} type="button" size="sm" variant={range === value ? 'secondary' : 'outline'} aria-pressed={range === value} onClick={() => setRange(value)}>
                {value === '7d' ? (isTr ? '7 gün' : '7 days') : value === '30d' ? (isTr ? '30 gün' : '30 days') : (isTr ? '90 gün' : '90 days')}
              </Button>
            ))}
          </div>
          <Button type="button" size="sm" variant="outline" disabled={isValidating} onClick={() => void mutate()}>
            {isValidating ? (isTr ? 'Yenileniyor…' : 'Refreshing…') : (isTr ? 'Yenile' : 'Refresh')}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{(ERROR_COPY[errorCode] ?? ERROR_COPY.provider_error)[isTr ? 0 : 1]}</AlertDescription>
        </Alert>
      ) : isLoading || !report ? (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-20" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label={isTr ? 'Harcama' : 'Spend'} value={money(report.totals.spend)} />
            <Kpi label={isTr ? 'Gösterim' : 'Impressions'} value={number(report.totals.impressions)} />
            <Kpi label={isTr ? 'Erişim' : 'Reach'} value={number(report.totals.reach)} />
            <Kpi label={isTr ? 'Tıklama' : 'Clicks'} value={number(report.totals.clicks)} />
            <Kpi label="CTR" value={percent(report.totals.ctr)} />
            <Kpi label="CPC" value={report.totals.cpc === null ? '—' : money(report.totals.cpc)} />
          </div>

          {report.campaigns.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              {isTr ? 'Bu aralıkta kampanya verisi yok.' : 'No campaign data in this range.'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isTr ? 'Kampanya' : 'Campaign'}</TableHead>
                    <TableHead>{isTr ? 'Durum' : 'Status'}</TableHead>
                    <TableHead className="text-right">{isTr ? 'Günlük bütçe' : 'Daily budget'}</TableHead>
                    <TableHead className="text-right">{isTr ? 'Harcama' : 'Spend'}</TableHead>
                    <TableHead className="text-right">{isTr ? 'Gösterim' : 'Impr.'}</TableHead>
                    <TableHead className="text-right">{isTr ? 'Tıklama' : 'Clicks'}</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.campaigns.map((campaign) => {
                    const budget = metaMinorToMajor(campaign.dailyBudgetMinor, currency)
                    return (
                      <TableRow key={campaign.id}>
                        <TableCell className="max-w-64 truncate font-medium">{campaign.name}</TableCell>
                        <TableCell>{metaCampaignStatusLabel(campaign.effectiveStatus ?? campaign.status, isTr)}</TableCell>
                        <TableCell className="text-right tabular-nums">{budget === null ? '—' : money(budget)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(campaign.spend)}</TableCell>
                        <TableCell className="text-right tabular-nums">{number(campaign.impressions)}</TableCell>
                        <TableCell className="text-right tabular-nums">{number(campaign.clicks)}</TableCell>
                        <TableCell className="text-right tabular-nums">{percent(campaign.ctr)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {data?.cached ? (
            <p className="text-xs text-muted-foreground">
              {isTr ? 'Önbellekten gösteriliyor; Meta isteklerini korumak için veriler kısa süre saklanır.' : 'Shown from cache; data is kept briefly to protect Meta request limits.'}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
