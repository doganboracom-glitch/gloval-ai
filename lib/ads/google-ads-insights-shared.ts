import { z } from 'zod'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000

export type GoogleAdsRangePreset = '7d' | '30d' | '90d' | 'custom'

export type GoogleAdsDatePeriod = {
  from: string
  to: string
  previousFrom: string
  previousTo: string
  days: number
  previousDays: number
}

export type GoogleAdsMetrics = {
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
}

export type GoogleAdsDailyPoint = GoogleAdsMetrics & { date: string }

export type GoogleAdsCampaignInsight = {
  id: string
  name: string
  status: string
  current: GoogleAdsMetrics
  previous: GoogleAdsMetrics
  budgetId: string | null
  dailyBudgetMicros: number | null
}

export type GoogleAdsTermInsight = {
  text: string
  campaignId: string
  campaignName: string
  metrics: GoogleAdsMetrics
}

export type GoogleAdsDeviceInsight = GoogleAdsMetrics & { device: string }
export type GoogleAdsHourInsight = GoogleAdsMetrics & { hour: number }

export type GoogleAdsInsightsReport = {
  range: GoogleAdsDatePeriod
  currency: string | null
  summary: GoogleAdsMetrics
  previous: GoogleAdsMetrics
  daily: GoogleAdsDailyPoint[]
  previousDaily: GoogleAdsDailyPoint[]
  campaigns: GoogleAdsCampaignInsight[]
  keywords: GoogleAdsTermInsight[]
  searchTerms: GoogleAdsTermInsight[]
  devices: GoogleAdsDeviceInsight[]
  hours: GoogleAdsHourInsight[]
  budget: {
    dailyBudgetMicros: number
    monthlyBudgetMicros: number
    projectedSpendMicros: number
    pacingRatio: number | null
  }
  truncated: {
    segments: boolean
    campaigns: boolean
  }
}

export type RawGoogleAdsRow = Record<string, unknown>

export const googleAdsInsightsDateRangeSchema = z.object({
  from: z.string().regex(DATE_PATTERN),
  to: z.string().regex(DATE_PATTERN),
})

function toUtcDate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null
}

function formatUtcDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function shiftDate(value: string, days: number): string {
  const date = toUtcDate(value)
  if (!date) throw new Error('invalid_google_ads_date')
  date.setUTCDate(date.getUTCDate() + days)
  return formatUtcDate(date)
}

export function getGoogleAdsDatePeriod(
  preset: Exclude<GoogleAdsRangePreset, 'custom'>,
  now = new Date(),
): GoogleAdsDatePeriod {
  const days = preset === '7d' ? 7 : preset === '90d' ? 90 : 30
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  const to = formatUtcDate(end)
  const from = shiftDate(to, -(days - 1))
  const previousTo = shiftDate(from, -1)
  const previousFrom = shiftDate(previousTo, -(days - 1))
  return { from, to, previousFrom, previousTo, days, previousDays: days }
}

export function parseGoogleAdsCustomPeriod(
  fromValue: unknown,
  toValue: unknown,
  now = new Date(),
): GoogleAdsDatePeriod | null {
  const parsed = googleAdsInsightsDateRangeSchema.safeParse({ from: fromValue, to: toValue })
  if (!parsed.success) return null

  const fromDate = toUtcDate(parsed.data.from)
  const toDate = toUtcDate(parsed.data.to)
  if (!fromDate || !toDate || fromDate > toDate) return null

  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  if (toDate > yesterday) return null

  const days = Math.floor((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1
  if (days < 7 || days > 90) return null

  const previousTo = shiftDate(parsed.data.from, -1)
  const previousFrom = shiftDate(previousTo, -(days - 1))
  return {
    from: parsed.data.from,
    to: parsed.data.to,
    previousFrom,
    previousTo,
    days,
    previousDays: days,
  }
}

export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / Math.abs(previous)) * 100
}

export function shouldRefreshGoogleAdsReport(input: {
  force: boolean
  refreshedAt: string | null
  now: number
  cacheTtlMs: number
  forceCooldownMs: number
}): { shouldRefresh: boolean; limited: boolean; retryAfterSeconds: number } {
  if (!input.refreshedAt) return { shouldRefresh: true, limited: false, retryAfterSeconds: 0 }
  const refreshedTime = Date.parse(input.refreshedAt)
  if (!Number.isFinite(refreshedTime)) return { shouldRefresh: true, limited: false, retryAfterSeconds: 0 }

  const age = Math.max(0, input.now - refreshedTime)
  if (input.force && age < input.forceCooldownMs) {
    return {
      shouldRefresh: false,
      limited: true,
      retryAfterSeconds: Math.ceil((input.forceCooldownMs - age) / 1000),
    }
  }
  if (!input.force && age < input.cacheTtlMs) {
    return { shouldRefresh: false, limited: false, retryAfterSeconds: 0 }
  }
  return { shouldRefresh: true, limited: false, retryAfterSeconds: 0 }
}

function record(value: unknown): RawGoogleAdsRow {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RawGoogleAdsRow : {}
}

function nested(value: unknown, ...keys: string[]): unknown {
  let current: unknown = value
  for (const key of keys) {
    const source = record(current)
    current = source[key] ?? source[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)]
  }
  return current
}

function numberValue(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function metric(row: RawGoogleAdsRow, key: keyof GoogleAdsMetrics): number {
  const raw = nested(row, 'metrics', key === 'costMicros' ? 'costMicros' : key)
  return numberValue(raw)
}

function metricsFromRow(row: RawGoogleAdsRow): GoogleAdsMetrics {
  return {
    impressions: metric(row, 'impressions'),
    clicks: metric(row, 'clicks'),
    costMicros: metric(row, 'costMicros'),
    conversions: metric(row, 'conversions'),
  }
}

function emptyMetrics(): GoogleAdsMetrics {
  return { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 }
}

function addMetrics(target: GoogleAdsMetrics, value: GoogleAdsMetrics): void {
  target.impressions += value.impressions
  target.clicks += value.clicks
  target.costMicros += value.costMicros
  target.conversions += value.conversions
}

function datePoints(from: string, days: number, rows: RawGoogleAdsRow[]): GoogleAdsDailyPoint[] {
  const points = new Map<string, GoogleAdsDailyPoint>()
  for (let index = 0; index < days; index += 1) {
    const date = shiftDate(from, index)
    points.set(date, { date, ...emptyMetrics() })
  }

  for (const row of rows) {
    const date = nested(row, 'segments', 'date')
    if (typeof date !== 'string') continue
    const point = points.get(date)
    if (point) addMetrics(point, metricsFromRow(row))
  }

  return [...points.values()]
}

function inPeriod(date: string, from: string, to: string): boolean {
  return date >= from && date <= to
}

function buildTerms(rows: RawGoogleAdsRow[], field: 'keyword' | 'searchTerm'): GoogleAdsTermInsight[] {
  return rows.flatMap((row) => {
    const text = field === 'keyword'
      ? nested(row, 'adGroupCriterion', 'keyword', 'text')
      : nested(row, 'searchTermView', 'searchTerm')
    const campaignId = nested(row, 'campaign', 'id')
    const campaignName = nested(row, 'campaign', 'name')
    if (typeof text !== 'string' || typeof campaignId !== 'string') return []
    return [{
      text: text.slice(0, 240),
      campaignId,
      campaignName: typeof campaignName === 'string' ? campaignName.slice(0, 160) : 'Kampanya',
      metrics: metricsFromRow(row),
    }]
  })
}

export function buildGoogleAdsInsightsReport(input: {
  range: GoogleAdsDatePeriod
  currency: string | null
  segmentRows: RawGoogleAdsRow[]
  campaignRows: RawGoogleAdsRow[]
  keywordRows: RawGoogleAdsRow[]
  searchTermRows: RawGoogleAdsRow[]
  refreshedAt: string
  segmentLimit: number
  campaignLimit: number
}): GoogleAdsInsightsReport {
  const currentRows = input.segmentRows.filter((row) => {
    const date = nested(row, 'segments', 'date')
    return typeof date === 'string' && inPeriod(date, input.range.from, input.range.to)
  })
  const previousRows = input.segmentRows.filter((row) => {
    const date = nested(row, 'segments', 'date')
    return typeof date === 'string' && inPeriod(date, input.range.previousFrom, input.range.previousTo)
  })
  const daily = datePoints(input.range.from, input.range.days, currentRows)
  const previousDaily = datePoints(input.range.previousFrom, input.range.previousDays, previousRows)
  const summary = daily.reduce((sum, point) => {
    addMetrics(sum, point)
    return sum
  }, emptyMetrics())
  const previous = previousDaily.reduce((sum, point) => {
    addMetrics(sum, point)
    return sum
  }, emptyMetrics())

  const campaigns = new Map<string, GoogleAdsCampaignInsight>()
  const budgets = new Map<string, number>()
  for (const row of input.campaignRows) {
    const date = nested(row, 'segments', 'date')
    const campaignId = nested(row, 'campaign', 'id')
    const campaignName = nested(row, 'campaign', 'name')
    if (typeof date !== 'string' || typeof campaignId !== 'string' || typeof campaignName !== 'string') continue
    const campaign = record(nested(row, 'campaign'))
    const budget = record(nested(row, 'campaignBudget'))
    const budgetIdValue = budget.id
    const budgetId = typeof budgetIdValue === 'string' || typeof budgetIdValue === 'number'
      ? String(budgetIdValue)
      : null
    const dailyBudgetMicros = budget.amountMicros === undefined ? null : numberValue(budget.amountMicros)
    const currentPeriod = inPeriod(date, input.range.from, input.range.to)
    const previousPeriod = inPeriod(date, input.range.previousFrom, input.range.previousTo)
    if (!currentPeriod && !previousPeriod) continue

    let item = campaigns.get(campaignId)
    if (!item) {
      item = {
        id: campaignId,
        name: campaignName.slice(0, 160),
        status: typeof campaign.status === 'string' ? campaign.status : 'UNKNOWN',
        current: emptyMetrics(),
        previous: emptyMetrics(),
        budgetId,
        dailyBudgetMicros,
      }
      campaigns.set(campaignId, item)
    }
    addMetrics(currentPeriod ? item.current : item.previous, metricsFromRow(row))

    if (currentPeriod && item.status === 'ENABLED' && budgetId && dailyBudgetMicros !== null) {
      budgets.set(budgetId, Math.max(budgets.get(budgetId) ?? 0, dailyBudgetMicros))
    }
  }

  const campaignList = [...campaigns.values()].sort((a, b) => b.current.costMicros - a.current.costMicros)
  const dailyBudgetMicros = [...budgets.values()].reduce((sum, amount) => sum + amount, 0)
  const projectedSpendMicros = input.range.days > 0 ? summary.costMicros * 30 / input.range.days : 0
  const monthlyBudgetMicros = dailyBudgetMicros * 30
  const pacingRatio = monthlyBudgetMicros > 0 ? projectedSpendMicros / monthlyBudgetMicros : null

  const deviceMetrics = new Map<string, GoogleAdsMetrics>()
  const hourMetrics = new Map<number, GoogleAdsMetrics>()
  for (const row of currentRows) {
    const rowMetrics = metricsFromRow(row)
    const device = nested(row, 'segments', 'device')
    if (typeof device === 'string') {
      const current = deviceMetrics.get(device) ?? emptyMetrics()
      addMetrics(current, rowMetrics)
      deviceMetrics.set(device, current)
    }
    const rawHour = nested(row, 'segments', 'hour')
    const hour = Number(rawHour)
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
      const current = hourMetrics.get(hour) ?? emptyMetrics()
      addMetrics(current, rowMetrics)
      hourMetrics.set(hour, current)
    }
  }

  const devices = [...deviceMetrics.entries()]
    .map(([device, values]) => ({ device, ...values }))
    .sort((a, b) => b.costMicros - a.costMicros)
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, ...(hourMetrics.get(hour) ?? emptyMetrics()) }))

  return {
    range: input.range,
    currency: input.currency,
    summary,
    previous,
    daily,
    previousDaily,
    campaigns: campaignList,
    keywords: buildTerms(input.keywordRows, 'keyword'),
    searchTerms: buildTerms(input.searchTermRows, 'searchTerm'),
    devices,
    hours,
    budget: { dailyBudgetMicros, monthlyBudgetMicros, projectedSpendMicros, pacingRatio },
    truncated: {
      segments: input.segmentRows.length >= input.segmentLimit,
      campaigns: input.campaignRows.length >= input.campaignLimit,
    },
  }
}

export function isGoogleAdsInsightsReport(value: unknown): value is GoogleAdsInsightsReport {
  const report = record(value)
  const summary = record(report.summary)
  const range = record(report.range)
  return typeof range.from === 'string'
    && typeof range.to === 'string'
    && typeof range.previousFrom === 'string'
    && typeof range.previousTo === 'string'
    && typeof range.days === 'number'
    && typeof summary.impressions === 'number'
    && typeof summary.clicks === 'number'
    && typeof summary.costMicros === 'number'
    && typeof summary.conversions === 'number'
    && Array.isArray(report.daily)
    && Array.isArray(report.campaigns)
    && Array.isArray(report.keywords)
    && Array.isArray(report.searchTerms)
}

export function buildGoogleAdsInsightsCsv(report: GoogleAdsInsightsReport): string {
  const rows: Array<Array<string | number | null>> = [[
    'Bölüm',
    'Tarih',
    'Kampanya / terim',
    'Gösterim',
    'Tıklama',
    'Harcama',
    'Dönüşüm',
    'Para birimi',
  ]]
  const currency = report.currency ?? 'TRY'

  for (const campaign of report.campaigns) {
    rows.push([
      'Kampanya',
      `${report.range.from} – ${report.range.to}`,
      campaign.name,
      campaign.current.impressions,
      campaign.current.clicks,
      campaign.current.costMicros / 1_000_000,
      campaign.current.conversions,
      currency,
    ])
  }
  for (const point of report.daily) {
    rows.push([
      'Günlük',
      point.date,
      '',
      point.impressions,
      point.clicks,
      point.costMicros / 1_000_000,
      point.conversions,
      currency,
    ])
  }

  const escapeCell = (value: string | number | null): string => {
    let text = value === null ? '' : String(value)
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }

  return `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}`
}
