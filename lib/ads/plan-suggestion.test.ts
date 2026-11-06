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
  it('does not clamp user-editable suggestions when no technical ceiling is configured', () => {
    const result = buildPlanSuggestion(scanResult, { currency: 'TRY', serverCapMinor: null })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.suggestion.budget?.dailyMinor).toBeGreaterThan(100_000)
    expect(result.suggestion.plan.aiRecommendedDailyBudgetMinor).toBe(result.suggestion.budget?.dailyMinor)
    expect(result.suggestion.budgetIssue).toBeNull()
  })

  it('keeps the suggested amount intact and flags a configured technical ceiling for support', () => {
    const result = buildPlanSuggestion(scanResult, { currency: 'TRY', serverCapMinor: 100_000 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.suggestion.budget?.dailyMinor).toBeGreaterThan(100_000)
    expect(result.suggestion.budgetIssue).toBe('budget_sanity_ceiling_exceeded')
  })
})
