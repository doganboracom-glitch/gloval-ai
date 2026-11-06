import { describe, expect, it } from 'vitest'
import {
  buildGoogleAdsApprovalSummary,
  googleAdsMicrosFromMinorUnits,
  maxGoogleAdsBudgetMinor,
} from '@/lib/ads/google-ads-publish-plan'

describe('Google Ads currency budget boundaries', () => {
  it('accepts budgets above the old integer ceiling without a product cap', () => {
    const summary = buildGoogleAdsApprovalSummary({ currency: 'TRY', dailyBudgetMinor: 2_147_483_648 })
    expect(summary.dailyBudgetMinor).toBe(2_147_483_648)
    expect(googleAdsMicrosFromMinorUnits(summary.dailyBudgetMinor, 'TRY')).toBe('21474836480000')
  })

  it('accepts any positive minor-unit amount, including a fractional currency unit', () => {
    expect(buildGoogleAdsApprovalSummary({ currency: 'TRY', dailyBudgetMinor: 1 }).dailyBudgetMinor).toBe(1)
    expect(() => buildGoogleAdsApprovalSummary({ currency: 'TRY', dailyBudgetMinor: 0 }))
      .toThrowError(expect.objectContaining({ code: 'invalid_budget' }))
  })

  it('limits only amounts that cannot be represented exactly as Google Ads micros', () => {
    const maximum = maxGoogleAdsBudgetMinor('TRY')
    expect(Number.isSafeInteger(maximum)).toBe(true)
    expect(googleAdsMicrosFromMinorUnits(maximum, 'TRY')).toBe(String(maximum * 10_000))
    expect(() => googleAdsMicrosFromMinorUnits(maximum + 1, 'TRY'))
      .toThrowError(expect.objectContaining({ code: 'invalid_budget' }))
  })

  it('uses zero-decimal currency precision', () => {
    expect(googleAdsMicrosFromMinorUnits(3_000_000_000, 'KRW')).toBe('3000000000000000')
  })
})
