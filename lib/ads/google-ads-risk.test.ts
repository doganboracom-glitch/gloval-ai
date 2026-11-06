import { describe, expect, it } from 'vitest'
import {
  evaluateGoogleAdsAmountRisk,
  googleAdsMonthlyBudgetUpperBoundMinor,
  googleAdsRiskConfirmationError,
} from '@/lib/ads/google-ads-risk'

describe('Google Ads amount-risk policy', () => {
  it('keeps ordinary budget amounts at or below every threshold on the standard confirmation path', () => {
    expect(evaluateGoogleAdsAmountRisk({
      amountMinor: 99_999,
      currency: 'TRY',
      recommendedDailyBudgetMinor: 50_000,
      averageDailySpend30dMinor: 33_333,
      previousDailyBudgetMinor: 10_000,
    })).toMatchObject({ risky: false, reasons: [] })
  })

  it('flags amounts above the saved plan budget reference', () => {
    expect(evaluateGoogleAdsAmountRisk({
      amountMinor: 20_001,
      currency: 'TRY',
      planBudgetCapMinor: 20_000,
    }).reasons).toEqual(['above_plan_cap'])
  })

  it('flags amounts above three times the proposed AI plan budget', () => {
    expect(evaluateGoogleAdsAmountRisk({
      amountMinor: 150_001,
      currency: 'TRY',
      recommendedDailyBudgetMinor: 50_000,
    }).reasons).toContain('above_recommendation')
  })

  it('flags amounts above three times the available 30-day average daily spend', () => {
    expect(evaluateGoogleAdsAmountRisk({
      amountMinor: 90_001,
      currency: 'TRY',
      averageDailySpend30dMinor: 30_000,
    }).reasons).toEqual(['above_recent_spend'])
  })

  it('flags a tenfold increase from the previous budget', () => {
    expect(evaluateGoogleAdsAmountRisk({
      amountMinor: 100_000,
      currency: 'TRY',
      previousDailyBudgetMinor: 10_000,
    }).reasons).toContain('tenfold_previous_budget')
  })

  it('uses the configured 1,000 TRY equivalent threshold for foreign currencies', () => {
    expect(evaluateGoogleAdsAmountRisk({ amountMinor: 2_501, currency: 'USD' }).reasons).toEqual(['absolute_threshold'])
  })

  it('requires the exact amount to be typed again for risky operations', () => {
    const risk = { risky: true, amountMinor: 75_000 }
    expect(googleAdsRiskConfirmationError(risk)).toBe('risk_confirmation_required')
    expect(googleAdsRiskConfirmationError({ ...risk, riskConfirmedAmountMinor: 74_999 })).toBe('risk_confirmation_mismatch')
    expect(googleAdsRiskConfirmationError({ ...risk, riskConfirmedAmountMinor: 75_000 })).toBeNull()
    expect(googleAdsRiskConfirmationError({ risky: false, amountMinor: 75_000 })).toBeNull()
    expect(googleAdsRiskConfirmationError({ risky: false, amountMinor: 75_000, riskConfirmedAmountMinor: 75_000 })).toBe('risk_confirmation_mismatch')
  })

  it('calculates the monthly commitment using 30.4 days', () => {
    expect(googleAdsMonthlyBudgetUpperBoundMinor(1_000)).toBe(30_400)
  })
})
