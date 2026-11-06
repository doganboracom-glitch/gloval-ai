'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type {
  GoogleAdsInsightsReport,
  GoogleAdsMetrics,
} from '@/lib/ads/google-ads-insights-shared'

export type GoogleAdsTrendMetric = 'costMicros' | 'clicks' | 'impressions'

const trendLabels: Record<GoogleAdsTrendMetric, string> = {
  costMicros: 'Harcama',
  clicks: 'Tıklama',
  impressions: 'Gösterim',
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(value)
}

function formatCurrency(value: number, currency: string | null): string {
  const code = currency && /^[A-Z]{3}$/.test(currency) ? currency : 'TRY'
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  }).format(value)
}

function displayMetric(value: number, metric: GoogleAdsTrendMetric, currency: string | null): string {
  return metric === 'costMicros'
    ? formatCurrency(value, currency)
    : formatCount(value)
}

function metricValue(metrics: GoogleAdsMetrics, metric: GoogleAdsTrendMetric): number {
  return metric === 'costMicros' ? metrics.costMicros / 1_000_000 : metrics[metric]
}

const trendChartConfig = {
  current: { label: 'Seçilen dönem', color: 'var(--chart-1)' },
  previous: { label: 'Önceki dönem', color: 'var(--chart-2)' },
} satisfies ChartConfig

const hourlyChartConfig = {
  clicks: { label: 'Tıklama', color: 'var(--chart-1)' },
} satisfies ChartConfig

export function GoogleAdsInsightsCharts({
  report,
  currency,
  metric,
  onMetricChange,
}: {
  report: GoogleAdsInsightsReport
  currency: string | null
  metric: GoogleAdsTrendMetric
  onMetricChange: (value: GoogleAdsTrendMetric) => void
}) {
  const trend = report.daily.map((point, index) => {
    const previous = report.previousDaily[index]
    const date = new Date(`${point.date}T00:00:00.000Z`)
    const label = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date)

    return {
      label,
      current: metricValue(point, metric),
      previous: previous ? metricValue(previous, metric) : null,
    }
  })

  const maxDeviceValue = Math.max(1, ...report.devices.map((device) => device.impressions))
  const hourData = report.hours.map((point) => ({
    hour: `${String(point.hour).padStart(2, '0')}:00`,
    clicks: point.clicks,
  }))

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="xl:col-span-2">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle>Günlük performans</CardTitle>
            <CardDescription>Seçilen aralık, önceki eşit dönemle karşılaştırılır.</CardDescription>
          </div>
          <ToggleGroup
            value={[metric]}
            onValueChange={(values) => {
              const value = values.at(-1)
              if (value === 'costMicros' || value === 'clicks' || value === 'impressions') onMetricChange(value)
            }}
            aria-label="Grafikte gösterilecek ölçüt"
            className="self-start"
          >
            {(['costMicros', 'clicks', 'impressions'] as const).map((value) => (
              <ToggleGroupItem key={value} value={value} aria-label={trendLabels[value]}>
                {trendLabels[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          <ChartContainer
            className="h-72 w-full"
            role="img"
            aria-label={`${trendLabels[metric]} günlük eğilimi; seçilen ve önceki dönem`}
            config={trendChartConfig}
          >
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} stroke="var(--muted-foreground)" />
                <YAxis
                  width={metric === 'costMicros' ? 76 : 52}
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                  tickFormatter={(value) => metric === 'costMicros' ? formatCurrency(Number(value), currency) : formatCount(Number(value))}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', borderColor: 'var(--border)' }}
                  formatter={(value) => [displayMetric(Number(value) || 0, metric, currency), '']}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="current"
                  name="Seçilen dönem"
                  stroke="var(--color-current)"
                  fill="var(--color-current)"
                  fillOpacity={0.14}
                  strokeWidth={2}
                  connectNulls
                />
                <Area
                  type="monotone"
                  dataKey="previous"
                  name="Önceki dönem"
                  stroke="var(--color-previous)"
                  fill="var(--color-previous)"
                  fillOpacity={0.04}
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  connectNulls
                />
            </AreaChart>
          </ChartContainer>
          <table className="sr-only">
            <caption>{trendLabels[metric]} günlük değerleri</caption>
            <thead><tr><th scope="col">Tarih</th><th scope="col">Seçilen dönem</th><th scope="col">Önceki dönem</th></tr></thead>
            <tbody>
              {trend.map((point) => (
                <tr key={point.label}>
                  <th scope="row">{point.label}</th>
                  <td>{displayMetric(point.current, metric, currency)}</td>
                  <td>{point.previous === null ? 'Veri yok' : displayMetric(point.previous, metric, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cihaz dağılımı</CardTitle>
          <CardDescription>Gösterimler ve tıklamalar, cihaz türüne göre.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {report.devices.length ? report.devices.map((device) => {
            const label = device.device === 'MOBILE'
              ? 'Mobil'
              : device.device === 'DESKTOP'
                ? 'Masaüstü'
                : device.device === 'TABLET'
                  ? 'Tablet'
                  : device.device === 'CONNECTED_TV'
                    ? 'Bağlı TV'
                    : device.device.replaceAll('_', ' ').toLocaleLowerCase('tr-TR')

            return (
              <div key={device.device} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{label}</span>
                  <span className="text-muted-foreground">
                    {formatCount(device.impressions)} gösterim · {formatCount(device.clicks)} tıklama
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`${label} gösterim payı`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((device.impressions / maxDeviceValue) * 100)}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(2, (device.impressions / maxDeviceValue) * 100)}%` }}
                  />
                </div>
              </div>
            )
          }) : <p className="text-sm text-muted-foreground">Bu aralıkta cihaz kırılımı yok.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saatlik tıklama</CardTitle>
          <CardDescription>Google Ads hesabının saat dilimine göre dağılım.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            className="h-56 w-full"
            role="img"
            aria-label="Günün saatlerine göre tıklama sayısı"
            config={hourlyChartConfig}
          >
            <BarChart data={hourData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} interval={3} stroke="var(--muted-foreground)" />
                <YAxis width={42} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" tickFormatter={(value) => formatCount(Number(value))} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', borderColor: 'var(--border)' }}
                  formatter={(value) => [formatCount(Number(value)), 'Tıklama']}
                />
                <Bar dataKey="clicks" name="Tıklama" fill="var(--color-clicks)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
          <table className="sr-only">
            <caption>Saatlik tıklama değerleri</caption>
            <thead><tr><th scope="col">Saat</th><th scope="col">Tıklama</th></tr></thead>
            <tbody>
              {hourData.map((point) => (
                <tr key={point.hour}><th scope="row">{point.hour}</th><td>{formatCount(point.clicks)}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
