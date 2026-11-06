'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { AlertCircle, Download, LoaderCircle, Printer, RefreshCw, Sparkles } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { GoogleAdsInsightsCharts, type GoogleAdsTrendMetric } from '@/components/ads/google-ads-insights-charts'
import { GoogleAdsReportSettings } from '@/components/ads/google-ads-report-settings'
import type { GoogleAdsConnectionView } from '@/components/ads/google-ads-dashboard'
import type { GoogleAdsInsightsReport, GoogleAdsMetrics, GoogleAdsRangePreset } from '@/lib/ads/google-ads-insights-shared'
import { buildGoogleAdsInsightsCsv, getGoogleAdsDatePeriod, parseGoogleAdsCustomPeriod, percentChange } from '@/lib/ads/google-ads-insights-shared'
import type { GoogleAdsAnalysis } from '@/lib/ads/google-ads-analysis-contract'

const MAX_ANALYSES_PER_DAY = 3

type InsightsResponse = {
  ok: true
  report: GoogleAdsInsightsReport
  refreshedAt: string
  cacheHit: boolean
  stale: boolean
  refreshLimited: boolean
  retryAfterSeconds: number
}

type AnalysisResponse = {
  ok: true
  analysis: GoogleAdsAnalysis
  usedToday: number | null
  cached: boolean
}

type ApiErrorPayload = { error?: string; used?: number; limit?: number }

class InsightsApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly used?: number) {
    super(code)
  }
}

async function fetchInsights(url: string): Promise<InsightsResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && typeof (payload as ApiErrorPayload).error === 'string'
      ? (payload as ApiErrorPayload).error!
      : 'provider_error'
    throw new InsightsApiError(error, response.status)
  }
  return payload as InsightsResponse
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(value)
}

function formatCurrencyMicros(value: number, currency: string | null): string {
  const code = currency && /^[A-Z]{3}$/.test(currency) ? currency : 'TRY'
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  }).format(value / 1_000_000)
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(value)}%`
}

function formatDelta(current: number, previous: number): string {
  const change = percentChange(current, previous)
  if (change === null) return 'Yeni'
  const sign = change > 0 ? '+' : ''
  return `${sign}${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(change)}%`
}

function campaignMetricsValue(metrics: GoogleAdsMetrics, key: 'costMicros' | 'clicks' | 'conversions' | 'ctr'): number {
  if (key === 'ctr') return metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0
  return metrics[key]
}

function getRangeLabel(report: GoogleAdsInsightsReport): string {
  return `${report.range.from} – ${report.range.to}`
}

function apiErrorMessage(error: unknown): string {
  if (!(error instanceof InsightsApiError)) return 'Rapor yüklenemedi. Biraz sonra tekrar deneyin.'
  switch (error.code) {
    case 'api_quota_exceeded':
      return 'Google Ads günlük okuma kotası doldu. Kota yenilendiğinde tekrar deneyin; mevcut hesap kotası korunmaktadır.'
    case 'rate_limited':
      return 'Bu Google Ads hesabı için rapor yenileme sınırına ulaşıldı. Daha sonra tekrar deneyin.'
    case 'reauth_required':
    case 'not_authorized':
      return 'Google Ads bağlantısının yeniden yetkilendirilmesi gerekiyor.'
    case 'connection_busy':
      return 'Bu hesapta başka bir okuma işlemi sürüyor. Biraz sonra tekrar deneyin.'
    case 'connection_not_found':
      return 'Bu Google Ads hesabına erişilemiyor. Bağlantıyı kontrol edin.'
    case 'configuration_missing':
      return 'Google Ads bağlantı yapılandırması tamamlanmamış.'
    case 'analysis_daily_limit':
      return `Günlük AI analiz sınırı doldu (${error.used ?? MAX_ANALYSES_PER_DAY}/${MAX_ANALYSES_PER_DAY}). Yarın tekrar deneyebilirsiniz.`
    case 'report_storage_unavailable':
      return 'AI analiz sayacı henüz hazır değil. Veritabanı kurulumundan sonra tekrar deneyin.'
    default:
      return 'Google Ads verisi alınamadı. Bağlantı durumunu kontrol edip tekrar deneyin.'
  }
}

function MetricCard({
  label,
  value,
  delta,
  detail,
}: {
  label: string
  value: string
  delta?: string
  detail?: string
}) {
  return (
    <Card>
      <CardContent className="flex min-h-28 flex-col justify-between gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          {delta ? <Badge variant="outline">{delta}</Badge> : null}
        </div>
        <div>
          <p className="text-xl font-semibold tracking-tight">{value}</p>
          {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function ConversionTrackingNotice() {
  return (
    <Alert role="status">
      <AlertCircle data-icon="inline-start" />
      <AlertTitle>Dönüşüm ölçümü kurulu değil veya bu aralıkta veri yok</AlertTitle>
      <AlertDescription>
        Bu raporda dönüşüm kaydı görünmüyor. İzleme doğrulanana kadar kampanya verimliliği veya boşa harcama hakkında yorum yapılmıyor.
        <details className="mt-3">
          <summary className="cursor-pointer font-medium">Kontrol adımlarını göster</summary>
          <ol className="mt-2 list-decimal ps-5">
            <li>Google Ads içindeki Hedefler → Dönüşümler bölümünde web sitesi dönüşüm işlemlerini kontrol edin.</li>
            <li>Google etiketi veya Google Tag Manager üzerinden form başarı ve satın alma olaylarını ölçün.</li>
            <li>Test dönüşümünü tamamlayıp Google Ads’te kayıt oluştuğunu doğrulayın.</li>
          </ol>
          <a
            className="mt-2 inline-block underline underline-offset-4"
            href="https://support.google.com/google-ads/answer/6095821?hl=tr"
            target="_blank"
            rel="noreferrer"
          >
            Google Ads dönüşüm izleme rehberi
          </a>
        </details>
      </AlertDescription>
    </Alert>
  )
}

function InsightsLoadingState() {
  return (
    <div className="flex flex-col gap-4" aria-label="Performans raporu yükleniyor">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}
      </div>
      <Skeleton className="h-80" />
    </div>
  )
}

function formatAnalysisType(type: string): string {
  const labels: Record<string, string> = {
    kampanya: 'Kampanya',
    anahtar_kelime: 'Anahtar kelime',
    arama_terimi: 'Arama terimi',
    butce: 'Bütçe',
    olcum: 'Ölçüm',
  }
  return labels[type] ?? 'Öneri'
}

function AIAnalysisCard({
  report,
  requestBody,
  identityKey,
}: {
  report: GoogleAdsInsightsReport
  requestBody: Record<string, string>
  identityKey: string
}) {
  const [analysisState, setAnalysisState] = useState<{
    key: string
    analysis: GoogleAdsAnalysis
    usedToday: number | null
    cached: boolean
  } | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usedToday, setUsedToday] = useState<number | null>(null)
  const current = analysisState?.key === identityKey ? analysisState : null

  async function analyze() {
    setIsAnalyzing(true)
    setError(null)
    try {
      const response = await fetch('/api/ads/google/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const body = payload && typeof payload === 'object' ? payload as ApiErrorPayload : {}
        if (typeof body.used === 'number') setUsedToday(body.used)
        throw new InsightsApiError(body.error ?? 'provider_error', response.status, body.used)
      }
      const result = payload as AnalysisResponse
      setAnalysisState({
        key: identityKey,
        analysis: result.analysis,
        usedToday: result.usedToday,
        cached: result.cached,
      })
      if (result.usedToday !== null) setUsedToday(result.usedToday)
    } catch (analysisFailure) {
      setError(apiErrorMessage(analysisFailure))
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>AI performans analizi</CardTitle>
          <CardDescription>
            Yalnızca öneri üretir; kampanya, bütçe, teklif veya anahtar kelimelerde otomatik değişiklik yapmaz.
          </CardDescription>
        </div>
        <Button className="google-ads-print-hidden" onClick={analyze} disabled={isAnalyzing}>
          {isAnalyzing ? <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" /> : <Sparkles data-icon="inline-start" />}
          {isAnalyzing ? 'Analiz ediliyor' : 'Analiz et'}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{usedToday !== null ? `Bugün ${usedToday}/${MAX_ANALYSES_PER_DAY}` : `Günlük sınır: ${MAX_ANALYSES_PER_DAY} analiz`}</Badge>
          <span className="text-sm text-muted-foreground">Öneriler Google Ads verisine dayanır; yönetim API’si çağrılmaz.</span>
        </div>
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Analiz tamamlanamadı</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {current ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">Google Ads özeti</h3>
                  {current.cached ? <Badge variant="outline">Önbellekten</Badge> : null}
                </div>
                <p className="text-sm leading-relaxed">{current.analysis.summary}</p>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">İyi gidenler</p>
                  <p className="mt-1 text-sm leading-relaxed">{current.analysis.whatWorks}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dikkat edilmesi gerekenler</p>
                  <p className="mt-1 text-sm leading-relaxed">{current.analysis.waste}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {current.analysis.recommendations.map((recommendation, index) => (
                <Card key={`${recommendation.type}-${index}`} className="h-full">
                  <CardHeader className="gap-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{formatAnalysisType(recommendation.type)}</Badge>
                      <Badge variant="secondary">Güven: {recommendation.confidence === 'yuksek' ? 'yüksek' : recommendation.confidence === 'orta' ? 'orta' : 'düşük'}</Badge>
                    </div>
                    <CardTitle className="text-base">{recommendation.recommendedAction}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 p-4 pt-0">
                    {recommendation.campaignName || recommendation.keyword ? (
                      <p className="text-sm">
                        <span className="font-medium">Etkilenen: </span>
                        {[recommendation.campaignName, recommendation.keyword].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                    <p className="text-sm leading-relaxed text-muted-foreground">{recommendation.why}</p>
                    {recommendation.estimatedMonthlySavingsMicros !== null ? (
                      <p className="text-sm">
                        <span className="font-medium">Olası aylık üst sınır: </span>
                        {formatCurrencyMicros(recommendation.estimatedMonthlySavingsMicros, report.currency)}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{current.analysis.savingsDisclaimer}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Analiz başlatıldığında seçili dönem için üç uygulanabilir öneri hazırlanır.</p>
        )}
      </CardContent>
    </Card>
  )
}

function CampaignTable({
  report,
  selectedCampaignId,
  onSelectCampaign,
}: {
  report: GoogleAdsInsightsReport
  selectedCampaignId: string | null
  onSelectCampaign: (campaignId: string | null) => void
}) {
  const [sort, setSort] = useState<{ key: 'costMicros' | 'clicks' | 'conversions' | 'ctr'; direction: 'asc' | 'desc' }>({
    key: 'costMicros',
    direction: 'desc',
  })
  const rows = useMemo(() => [...report.campaigns].sort((left, right) => {
    const difference = campaignMetricsValue(left.current, sort.key) - campaignMetricsValue(right.current, sort.key)
    return sort.direction === 'desc' ? -difference : difference
  }), [report.campaigns, sort])

  function toggleSort(key: typeof sort.key) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
      : { key, direction: 'desc' })
  }

  function sortHeader(label: string, key: typeof sort.key) {
    return (
      <button type="button" className="font-medium hover:text-foreground" onClick={() => toggleSort(key)}>
        {label}{sort.key === key ? (sort.direction === 'desc' ? ' ↓' : ' ↑') : ''}
      </button>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kampanya performansı</CardTitle>
        <CardDescription>
          Kampanyaya tıklayarak anahtar kelime ve arama terimlerini filtreleyin. Sıralama için sütun başlıklarını kullanın.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {report.truncated.campaigns ? (
          <p className="mb-3 text-sm text-muted-foreground">Google Ads satır sınırı nedeniyle kampanya ayrıntılarının bir bölümü alınamadı. Genel toplamlar ayrı günlük rapordan hesaplanır.</p>
        ) : null}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kampanya</TableHead>
                <TableHead className="text-end">{sortHeader('Harcama', 'costMicros')}</TableHead>
                <TableHead className="text-end">{sortHeader('Tıklama', 'clicks')}</TableHead>
                <TableHead className="text-end">CTR</TableHead>
                <TableHead className="text-end">{sortHeader('Dönüşüm', 'conversions')}</TableHead>
                <TableHead className="text-end">Dönüşüm başı maliyet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? rows.map((campaign) => {
                const ctr = campaign.current.impressions > 0 ? campaign.current.clicks / campaign.current.impressions * 100 : 0
                const cpa = campaign.current.conversions > 0 ? campaign.current.costMicros / campaign.current.conversions : null
                const selected = selectedCampaignId === campaign.id
                return (
                  <TableRow key={campaign.id} data-state={selected ? 'selected' : undefined}>
                    <TableCell className="min-w-56">
                      <button
                        type="button"
                        className="max-w-72 text-start font-medium hover:underline"
                        aria-pressed={selected}
                        onClick={() => onSelectCampaign(selected ? null : campaign.id)}
                      >
                        {campaign.name || 'Ads kampanyası'}
                      </button>
                    </TableCell>
                    <TableCell className="text-end">{formatCurrencyMicros(campaign.current.costMicros, report.currency)}</TableCell>
                    <TableCell className="text-end">{formatCount(campaign.current.clicks)}</TableCell>
                    <TableCell className="text-end">{formatPercent(ctr)}</TableCell>
                    <TableCell className="text-end">{campaign.current.conversions > 0 ? formatCount(campaign.current.conversions) : '—'}</TableCell>
                    <TableCell className="text-end">{cpa !== null ? formatCurrencyMicros(cpa, report.currency) : '—'}</TableCell>
                  </TableRow>
                )
              }) : (
                <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Bu tarih aralığında kampanya verisi yok.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {selectedCampaignId ? (
          <Button className="mt-3" variant="ghost" size="sm" onClick={() => onSelectCampaign(null)}>Kampanya filtresini temizle</Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

function TermsCard({
  title,
  description,
  items,
  currency,
  noConversionData,
}: {
  title: string
  description: string
  items: GoogleAdsInsightsReport['keywords']
  currency: string | null
  noConversionData: boolean
}) {
  const sorted = [...items].sort((left, right) => {
    if (!noConversionData) {
      const conversionDifference = right.metrics.conversions - left.metrics.conversions
      if (conversionDifference !== 0) return conversionDifference
    }
    return right.metrics.costMicros - left.metrics.costMicros
  }).slice(0, 8)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {sorted.length ? sorted.map((item) => (
          <div key={`${item.campaignId}-${item.text}`} className="flex flex-col gap-1 border-b pb-3 last:border-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <p className="break-words text-sm font-medium">{item.text || 'Ads terimi'}</p>
              <span className="shrink-0 text-sm">{formatCurrencyMicros(item.metrics.costMicros, currency)}</span>
            </div>
            <p className="text-xs text-muted-foreground">{item.campaignName || 'Kampanya adı yok'} · {formatCount(item.metrics.clicks)} tıklama · {noConversionData ? 'dönüşüm verisi yok' : `${formatCount(item.metrics.conversions)} dönüşüm`}</p>
          </div>
        )) : <p className="text-sm text-muted-foreground">Bu aralık için terim verisi bulunmuyor.</p>}
      </CardContent>
    </Card>
  )
}

export function GoogleAdsInsights({ connections }: { connections: GoogleAdsConnectionView[] }) {
  const directConnections = useMemo(
    () => connections.filter((connection) => !connection.isManager && connection.status === 'active'),
    [connections],
  )
  const [selectedConnectionId, setSelectedConnectionId] = useState(() => directConnections[0]?.id ?? '')
  const connectionId = directConnections.some((connection) => connection.id === selectedConnectionId)
    ? selectedConnectionId
    : directConnections[0]?.id ?? ''
  const [preset, setPreset] = useState<GoogleAdsRangePreset>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [refreshSequence, setRefreshSequence] = useState(0)
  const [trendMetric, setTrendMetric] = useState<GoogleAdsTrendMetric>('costMicros')
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)

  const customPeriod = preset === 'custom' ? parseGoogleAdsCustomPeriod(customFrom, customTo) : null
  const dateUrl = useMemo(() => {
    if (!connectionId) return null
    const params = new URLSearchParams({
      connectionId,
      range: preset,
      refresh: refreshSequence > 0 ? '1' : '0',
      request: String(refreshSequence),
    })
    if (preset === 'custom') {
      if (!customPeriod) return null
      params.set('from', customPeriod.from)
      params.set('to', customPeriod.to)
    }
    return `/api/ads/google/insights?${params.toString()}`
  }, [connectionId, preset, customPeriod?.from, customPeriod?.to, refreshSequence])
  const { data, error, isLoading, isValidating } = useSWR<InsightsResponse>(dateUrl, fetchInsights, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    refreshInterval: 0,
  })
  const report = data?.report
  const noConversionData = Boolean(report && report.summary.conversions === 0)
  const reportKey = `${connectionId}:${report?.range.from ?? preset}:${report?.range.to ?? ''}`
  const requestBody = useMemo(() => {
    const body: Record<string, string> = { connectionId, range: preset }
    if (preset === 'custom') {
      body.from = customPeriod?.from ?? ''
      body.to = customPeriod?.to ?? ''
    }
    return body
  }, [connectionId, preset, customPeriod?.from, customPeriod?.to])
  const hasManagerOnlyConnections = connections.length > 0 && connections.every((connection) => connection.isManager)
  const needsReauth = connections.some((connection) => connection.status === 'error' || connection.status === 'revoked')

  function changePreset(value: string) {
    if (value !== '7d' && value !== '30d' && value !== '90d' && value !== 'custom') return
    setPreset(value)
    setRefreshSequence(0)
    setSelectedCampaignId(null)
  }

  function chooseConnection(value: string) {
    setSelectedConnectionId(value)
    setRefreshSequence(0)
    setSelectedCampaignId(null)
  }

  function downloadCsv() {
    if (!report) return
    const blob = new Blob([buildGoogleAdsInsightsCsv(report)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `google-ads-performans-${report.range.from}-${report.range.to}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="google-ads-insights-print-root flex flex-col gap-5" aria-labelledby="google-ads-insights-title">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .google-ads-insights-print-root,
          .google-ads-insights-print-root * { visibility: visible !important; }
          .google-ads-insights-print-root {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            padding: 16px !important;
            background: #fff !important;
            color: #111827 !important;
          }
          .google-ads-insights-print-root [data-slot="card"] {
            break-inside: avoid;
            background: #fff !important;
            color: #111827 !important;
            box-shadow: none !important;
            border-color: #d1d5db !important;
          }
          .google-ads-insights-print-root .text-muted-foreground { color: #4b5563 !important; }
          .google-ads-print-hidden { display: none !important; }
        }
      `}</style>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-muted-foreground">Google Ads · salt okunur performans</p>
          <h2 id="google-ads-insights-title" className="text-2xl font-semibold tracking-tight text-balance">Performans analizi</h2>
          <p className="text-sm text-muted-foreground">Harcama, kampanya ve arama terimi verileri bağlı hesaptan okunur; hiçbir Ads ayarı değiştirilmez.</p>
        </div>
        {report ? (
          <div className="google-ads-print-hidden flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer data-icon="inline-start" />Yazdır / PDF
            </Button>
            <Button variant="outline" onClick={downloadCsv}>
              <Download data-icon="inline-start" />CSV indir
            </Button>
            <Button variant="outline" onClick={() => setRefreshSequence((value) => value + 1)} disabled={isValidating}>
              <RefreshCw data-icon="inline-start" className={isValidating ? 'animate-spin' : undefined} />Yenile
            </Button>
          </div>
        ) : null}
      </div>

      {directConnections.length ? (
        <div className="google-ads-print-hidden flex flex-col gap-4 rounded-xl border bg-card p-4 md:flex-row md:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <label htmlFor="google-ads-insights-account" className="text-sm font-medium">Google Ads hesabı</label>
            <select
              id="google-ads-insights-account"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={connectionId}
              onChange={(event) => chooseConnection(event.target.value)}
            >
              {directConnections.map((connection, index) => (
                <option key={connection.id} value={connection.id}>{connection.name || `Google Ads hesabı ${index + 1}`}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <span className="text-sm font-medium">Tarih aralığı</span>
            <ToggleGroup value={[preset]} onValueChange={(values) => changePreset(values.at(-1) ?? '')} aria-label="Rapor tarih aralığı" className="justify-start">
              <ToggleGroupItem value="7d">7 gün</ToggleGroupItem>
              <ToggleGroupItem value="30d">30 gün</ToggleGroupItem>
              <ToggleGroupItem value="90d">90 gün</ToggleGroupItem>
              <ToggleGroupItem value="custom">Özel</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {preset === 'custom' ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-2">
                <label htmlFor="google-ads-insights-from" className="text-sm font-medium">Başlangıç</label>
                <Input id="google-ads-insights-from" type="date" value={customFrom} onChange={(event) => { setCustomFrom(event.target.value); setRefreshSequence(0) }} />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="google-ads-insights-to" className="text-sm font-medium">Bitiş</label>
                <Input id="google-ads-insights-to" type="date" value={customTo} onChange={(event) => { setCustomTo(event.target.value); setRefreshSequence(0) }} />
              </div>
            </div>
          ) : null}
        </div>
      ) : hasManagerOnlyConnections ? (
        <Alert role="status">
          <AlertTitle>Yönetici hesabı raporlanamıyor</AlertTitle>
          <AlertDescription>Performans raporları için doğrudan müşteri hesabı bağlayın; yönetici hesapları bu salt okunur görünümde desteklenmiyor.</AlertDescription>
        </Alert>
      ) : (
        <Alert role="status">
          <AlertTitle>Etkin Google Ads hesabı bulunamadı</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{needsReauth ? 'Bağlantı yetkisi yenilenmeli veya hesap yeniden bağlanmalı.' : 'Önce mevcut Google Ads panelinden bir hesap bağlayın.'}</span>
            <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href="/ads/dashboard">Bağlantıları yönet</Link>
          </AlertDescription>
        </Alert>
      )}

      {preset === 'custom' && !customPeriod ? (
        <p className="text-sm text-muted-foreground" role="status">Özel aralık, bitiş tarihi dünden geçmeyecek şekilde 7–90 gün olmalıdır.</p>
      ) : null}

      {data?.refreshLimited ? (
        <Alert role="status">
          <AlertTitle>Yenileme sınırı etkin</AlertTitle>
          <AlertDescription>
            Hesap kotasını korumak için rapor önbellekten gösteriliyor. Bir sonraki yenileme yaklaşık {Math.max(1, Math.ceil(data.retryAfterSeconds / 60))} dakika sonra kullanılabilir.
          </AlertDescription>
        </Alert>
      ) : null}
      {data?.stale ? (
        <Alert role="status">
          <AlertTitle>Önbelleğe alınmış veri</AlertTitle>
          <AlertDescription>Google Ads kotası veya yenileme sınırı nedeniyle son başarılı rapor gösteriliyor. Kampanya toplamları ile genel günlük toplamlar ayrı okuma sorgularından gelir.</AlertDescription>
        </Alert>
      ) : null}
      {error && !report ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Performans verisi alınamadı</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{apiErrorMessage(error)}</span>
            {(error instanceof InsightsApiError && ['reauth_required', 'not_authorized', 'connection_not_found'].includes(error.code)) ? (
              <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href="/ads/dashboard">Bağlantıyı yenile</Link>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {isLoading && directConnections.length ? <InsightsLoadingState /> : null}

      {report ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <p>Rapor aralığı: <span className="font-medium text-foreground">{getRangeLabel(report)}</span></p>
            <p>Son başarılı okuma: {new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.refreshedAt))}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Gösterim" value={formatCount(report.summary.impressions)} delta={formatDelta(report.summary.impressions, report.previous.impressions)} />
            <MetricCard label="Tıklama" value={formatCount(report.summary.clicks)} delta={formatDelta(report.summary.clicks, report.previous.clicks)} />
            <MetricCard
              label="CTR"
              value={formatPercent(report.summary.impressions > 0 ? report.summary.clicks / report.summary.impressions * 100 : 0)}
              delta={formatDelta(
                report.summary.impressions > 0 ? report.summary.clicks / report.summary.impressions : 0,
                report.previous.impressions > 0 ? report.previous.clicks / report.previous.impressions : 0,
              )}
            />
            <MetricCard label="Harcama" value={formatCurrencyMicros(report.summary.costMicros, report.currency)} delta={formatDelta(report.summary.costMicros, report.previous.costMicros)} />
            <MetricCard
              label="Ort. TBM"
              value={report.summary.clicks > 0 ? formatCurrencyMicros(report.summary.costMicros / report.summary.clicks, report.currency) : '—'}
              detail="Tıklama başına maliyet"
            />
            <MetricCard
              label="Dönüşüm"
              value={noConversionData ? '—' : formatCount(report.summary.conversions)}
              detail={noConversionData ? 'Bu aralıkta dönüşüm verisi yok' : undefined}
              delta={!noConversionData ? formatDelta(report.summary.conversions, report.previous.conversions) : undefined}
            />
            <MetricCard
              label="Dönüşüm başı maliyet"
              value={report.summary.conversions > 0 ? formatCurrencyMicros(report.summary.costMicros / report.summary.conversions, report.currency) : '—'}
              detail={noConversionData ? 'Dönüşüm ölçümü doğrulanmalı' : undefined}
            />
          </div>

          {noConversionData ? <ConversionTrackingNotice /> : null}

          <Card>
            <CardHeader>
              <CardTitle>Bütçe temposu</CardTitle>
              <CardDescription>Google Ads’te kayıtlı etkin günlük bütçelerden hesaplanan tahmin; hiçbir bütçe değiştirilmez.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div><p className="text-sm text-muted-foreground">Günlük bütçe toplamı</p><p className="mt-1 text-lg font-semibold">{formatCurrencyMicros(report.budget.dailyBudgetMicros, report.currency)}</p></div>
                <div><p className="text-sm text-muted-foreground">30 günlük bütçe eşdeğeri</p><p className="mt-1 text-lg font-semibold">{formatCurrencyMicros(report.budget.monthlyBudgetMicros, report.currency)}</p></div>
                <div><p className="text-sm text-muted-foreground">Aylık harcama tahmini</p><p className="mt-1 text-lg font-semibold">{formatCurrencyMicros(report.budget.projectedSpendMicros, report.currency)}</p></div>
              </div>
              {report.budget.pacingRatio !== null ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>Bütçe temposu</span>
                    <span className="font-medium">{formatPercent(report.budget.pacingRatio * 100)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Tahmini harcama bütçe oranı" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, report.budget.pacingRatio * 100)}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, report.budget.pacingRatio * 100))}%` }} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Bu hesapta kullanılabilir etkin kampanya bütçesi bulunamadı.</p>
              )}
              <p className="text-xs text-muted-foreground">Tahmin, seçilen aralıktaki günlük ortalama harcamanın 30 güne uzatılmasıdır; bütçe veya teklif ayarı değiştirilmez.</p>
            </CardContent>
          </Card>

          <GoogleAdsInsightsCharts
            report={report}
            currency={report.currency}
            metric={trendMetric}
            onMetricChange={setTrendMetric}
          />

          <CampaignTable
            report={report}
            selectedCampaignId={selectedCampaignId}
            onSelectCampaign={setSelectedCampaignId}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <TermsCard
              title={noConversionData ? 'Anahtar kelimeler · maliyet görünümü' : 'Öne çıkan anahtar kelimeler'}
              description={noConversionData ? 'Dönüşüm verisi olmadığı için maliyetler verimlilik veya israf olarak yorumlanmıyor.' : 'Dönüşüm ve maliyet metriklerine göre sıralanır.'}
              items={report.keywords.filter((item) => !selectedCampaignId || item.campaignId === selectedCampaignId)}
              currency={report.currency}
              noConversionData={noConversionData}
            />
            <TermsCard
              title={noConversionData ? 'Arama terimleri · maliyet görünümü' : 'Arama terimleri'}
              description={noConversionData ? 'Dönüşüm ölçümü doğrulanana kadar yalnızca ham metrikler gösterilir.' : 'Google Ads’in raporladığı arama terimleri; erişilebilir veriyle sınırlıdır.'}
              items={report.searchTerms.filter((item) => !selectedCampaignId || item.campaignId === selectedCampaignId)}
              currency={report.currency}
              noConversionData={noConversionData}
            />
          </div>

          <AIAnalysisCard report={report} requestBody={requestBody} identityKey={reportKey} />
          <GoogleAdsReportSettings key={connectionId} connectionId={connectionId} />
        </>
      ) : null}
    </section>
  )
}
