import { describe, expect, it } from 'vitest'
import { buildGoogleAdsReportEmail } from '@/lib/ads/google-ads-report-email-template'
import type { GoogleAdsInsightsReport } from '@/lib/ads/google-ads-insights-shared'

function report(): GoogleAdsInsightsReport {
  const metrics = { impressions: 100, clicks: 10, costMicros: 2_500_000, conversions: 0 }
  return {
    range: {
      from: '2025-06-01',
      to: '2025-06-07',
      previousFrom: '2025-05-25',
      previousTo: '2025-05-31',
      days: 7,
      previousDays: 7,
    },
    currency: 'TRY',
    summary: metrics,
    previous: { impressions: 80, clicks: 8, costMicros: 1_000_000, conversions: 0 },
    daily: [],
    previousDaily: [],
    campaigns: [{
      id: '123456789012',
      name: '<script>alert(1)</script>',
      status: 'ENABLED',
      current: metrics,
      previous: metrics,
      budgetId: 'budget-123',
      dailyBudgetMicros: 50_000_000,
    }],
    keywords: [],
    searchTerms: [],
    devices: [],
    hours: [],
    budget: {
      dailyBudgetMicros: 50_000_000,
      monthlyBudgetMicros: 1_500_000_000,
      projectedSpendMicros: 10_714_285,
      pacingRatio: 0.007,
    },
    truncated: { segments: false, campaigns: false },
  }
}

describe('Google Ads report email template', () => {
  it('creates a Turkish report and avoids conversion claims without conversion data', () => {
    const email = buildGoogleAdsReportEmail({
      frequencyLabel: 'Haftalık',
      report: report(),
      analysis: null,
      dashboardUrl: 'https://gloval.ai/ads/dashboard',
      unsubscribeUrl: 'https://gloval.ai/api/ads/google/reports/unsubscribe?token=opaque-token',
    })

    expect(email.subject).toContain('Haftalık Google Ads raporunuz')
    expect(email.html).toContain('Dönüşüm ölçümü kurulu değil veya bu dönemde veri yok')
    expect(email.text).toContain('verimlilik yorumu yapılmadı')
    expect(email.html).toContain('Harcama')
    expect(email.html).toContain('Önceki dönemle karşılaştırma')
    expect(email.html).toContain('E-posta raporlarından çık')
  })

  it('escapes campaign names and does not include Google account identifiers', () => {
    const email = buildGoogleAdsReportEmail({
      frequencyLabel: 'Aylık',
      report: report(),
      analysis: null,
      dashboardUrl: 'https://gloval.ai/ads/dashboard',
      unsubscribeUrl: 'https://gloval.ai/api/ads/google/reports/unsubscribe?token=opaque-token',
    })

    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(email.html).not.toContain('<script>alert(1)</script>')
    expect(email.html).not.toContain('123456789012')
    expect(email.html).not.toContain('budget-123')
  })
})
