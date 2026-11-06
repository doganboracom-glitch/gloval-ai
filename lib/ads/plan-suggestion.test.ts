import { describe, expect, it } from 'vitest'
import { buildPlanSuggestion } from '@/lib/ads/plan-suggestion'

const scanResult = {
  host: 'example.com',
  plan: {
    brand: 'Example',
    sector: 'services',
    sectorLabel: 'Services',
    services: ['Business consulting'],
    language: 'en' as const,
    country: 'TR',
    cities: [],
    keywords: ['business consulting', 'consulting services', 'business advice'],
    negativeKeywords: [],
  },
  ad: {
    headlines: ['Business consulting', 'Grow your business', 'Expert support'],
    descriptions: ['Trusted consulting for your business.', 'Talk to our team today.'],
    displayUrl: '',
  },
  budget: { daily: 100 },
  restricted: [],
}

describe('Google Ads plan budget suggestions', () => {
  it('returns an editable budget when no global budget ceiling is configured', () => {
    const result = buildPlanSuggestion(scanResult, {
      currency: 'TRY',
      budgetSanityCeilingMinor: null,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.suggestion.budget).not.toBeNull()
    expect(result.suggestion.budgetIssue).toBeNull()
  })

  it('asks users to contact support when an optional sanity ceiling is exceeded', () => {
    const result = buildPlanSuggestion(scanResult, {
      currency: 'TRY',
      budgetSanityCeilingMinor: 5_000,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.suggestion.budget).toBeNull()
    expect(result.suggestion.budgetIssue).toBe('budget_limit_exceeded')
  })
})
