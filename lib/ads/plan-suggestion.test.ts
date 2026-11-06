import { describe, expect, it } from 'vitest'
import { buildPlanSuggestion } from '@/lib/ads/plan-suggestion'

const scanResult = {
  host: 'local.example',
  plan: {
    brand: 'Local Service',
    sector: 'services',
    sectorLabel: 'Local services',
    services: ['Web design'],
    language: 'en',
    country: 'US',
    cities: [],
    keywords: ['local service', 'web design', 'nearby studio'],
    negativeKeywords: [],
  },
  ad: {
    headlines: ['Local service', 'Get a quote today', 'Trusted local team'],
    descriptions: ['Contact our local team today.', 'Book a consultation with our team.'],
    displayUrl: 'https://local.example/services',
  },
  budget: { daily: 1_000_000 },
  restricted: [],
}

describe('Google Ads plan budget suggestions', () => {
  it('keeps large user-editable suggestions and records the initial AI recommendation', () => {
    const result = buildPlanSuggestion(scanResult, { currency: 'TRY' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.suggestion.budget?.dailyMinor).toBeGreaterThan(100_000)
    expect(result.suggestion.plan.aiRecommendedDailyBudgetMinor).toBe(result.suggestion.budget?.dailyMinor)
  })
})
