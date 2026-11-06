import { describe, expect, it } from 'vitest'
import {
  buildGoogleAdsInsightsCsv,
  buildGoogleAdsInsightsReport,
  getGoogleAdsDatePeriod,
  parseGoogleAdsCustomPeriod,
  percentChange,
  shouldRefreshGoogleAdsReport,
} from '@/lib/ads/google-ads-insights-shared'

const FIXED_NOW = new Date('2025-06-10T12:00:00.000Z')

function buildReport() {
  const range = parseGoogleAdsCustomPeriod('2025-06-01', '2025-06-07', FIXED_NOW)
  if (!range) throw new Error('test_period_invalid')

  return buildGoogleAdsInsightsReport({
    range,
    currency: 'TRY',
    segmentRows: [
      {
        segments: { date: '2025-06-01', device: 'MOBILE', hour: '9' },
        metrics: { impressions: '100', clicks: '10', costMicros: '2500000', conversions: '1' },
      },
      {
        segments: { date: '2025-05-25', device: 'DESKTOP', hour: '11' },
        metrics: { impressions: '80', clicks: '8', costMicros: '1000000', conversions: '0' },
      },
    ],
    campaignRows: [
      {
        segments: { date: '2025-06-01' },
        campaign: { id: '123', name: '=HYPERLINK("https://bad.test")', status: 'ENABLED' },
        campaignBudget: { id: 'budget-1', amountMicros: '50000000' },
        metrics: { impressions: '100', clicks: '10', costMicros: '2500000', conversions: '1' },
      },
      {
        segments: { date: '2025-05-25' },
        campaign: { id: '123', name: '=HYPERLINK("https://bad.test")', status: 'ENABLED' },
        campaignBudget: { id: 'budget-1', amountMicros: '50000000' },
        metrics: { impressions: '80', clicks: '8', costMicros: '1000000', conversions: '0' },
      },
    ],
    keywordRows: [{
      campaign: { id: '123', name: 'Arama' },
      adGroupCriterion: { keyword: { text: 'ayakkabı' } },
      metrics: { impressions: '100', clicks: '10', costMicros: '2500000', conversions: '1' },
    }],
    searchTermRows: [{
      campaign: { id: '123', name: 'Arama' },
      searchTermView: { searchTerm: 'koşu ayakkabısı' },
      metrics: { impressions: '80', clicks: '8', costMicros: '1000000', conversions: '0' },
    }],
    refreshedAt: '2025-06-10T12:00:00.000Z',
    segmentLimit: 100,
    campaignLimit: 100,
  })
}

describe('Google Ads insight report utilities', () => {
  it('builds inclusive presets and equal-length previous periods', () => {
    expect(getGoogleAdsDatePeriod('7d', FIXED_NOW)).toEqual({
      from: '2025-06-03',
      to: '2025-06-09',
      previousFrom: '2025-05-27',
      previousTo: '2025-06-02',
      days: 7,
      previousDays: 7,
    })
  })

  it('accepts valid custom ranges and rejects short, future, or oversized ranges', () => {
    expect(parseGoogleAdsCustomPeriod('2025-06-01', '2025-06-07', FIXED_NOW)).toMatchObject({
      from: '2025-06-01',
      to: '2025-06-07',
      previousFrom: '2025-05-25',
      previousTo: '2025-05-31',
      days: 7,
      previousDays: 7,
    })
    expect(parseGoogleAdsCustomPeriod('2025-06-02', '2025-06-07', FIXED_NOW)).toBeNull()
    expect(parseGoogleAdsCustomPeriod('2025-06-01', '2025-06-10', FIXED_NOW)).toBeNull()
    expect(parseGoogleAdsCustomPeriod('2025-01-01', '2025-04-01', FIXED_NOW)).toBeNull()
  })

  it('aggregates daily, campaign, term, device, budget, and previous-period data', () => {
    const report = buildReport()
    expect(report.summary).toEqual({ impressions: 100, clicks: 10, costMicros: 2_500_000, conversions: 1 })
    expect(report.previous).toEqual({ impressions: 80, clicks: 8, costMicros: 1_000_000, conversions: 0 })
    expect(report.daily).toHaveLength(7)
    expect(report.previousDaily).toHaveLength(7)
    expect(report.campaigns[0]).toMatchObject({ id: '123', current: report.summary, previous: report.previous })
    expect(report.keywords[0]?.text).toBe('ayakkabı')
    expect(report.searchTerms[0]?.text).toBe('koşu ayakkabısı')
    expect(report.devices).toContainEqual(expect.objectContaining({ device: 'MOBILE', clicks: 10 }))
    expect(report.hours[9]?.clicks).toBe(10)
    expect(report.budget.dailyBudgetMicros).toBe(50_000_000)
    expect(report.budget.monthlyBudgetMicros).toBe(1_500_000_000)
  })

  it('does not invent a percent change when a previous period has no baseline', () => {
    expect(percentChange(0, 0)).toBe(0)
    expect(percentChange(3, 0)).toBeNull()
    expect(percentChange(15, 10)).toBe(50)
  })

  it('enforces the refresh cache and cooldown independently', () => {
    const refreshedAt = '2025-06-10T11:50:00.000Z'
    expect(shouldRefreshGoogleAdsReport({
      force: false,
      refreshedAt,
      now: Date.parse('2025-06-10T12:00:00.000Z'),
      cacheTtlMs: 30 * 60 * 1000,
      forceCooldownMs: 2 * 60 * 60 * 1000,
    })).toMatchObject({ shouldRefresh: false, limited: false })
    expect(shouldRefreshGoogleAdsReport({
      force: true,
      refreshedAt,
      now: Date.parse('2025-06-10T12:00:00.000Z'),
      cacheTtlMs: 30 * 60 * 1000,
      forceCooldownMs: 2 * 60 * 60 * 1000,
    })).toMatchObject({ shouldRefresh: false, limited: true })
  })

  it('neutralizes spreadsheet formulas in exported campaign cells', () => {
    const csv = buildGoogleAdsInsightsCsv(buildReport())
    expect(csv).toContain('"\'=HYPERLINK')
    expect(csv.startsWith('\uFEFF')).toBe(true)
  })
})
