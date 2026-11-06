import { describe, expect, it } from 'vitest'
import { ADS_ENV, resolveGoogleAdsBudgetSanityCeilingMinor } from '@/lib/ads/env'

describe('Google Ads budget sanity ceiling', () => {
  it('is unlimited when the optional environment setting is absent', () => {
    expect(resolveGoogleAdsBudgetSanityCeilingMinor({})).toBeNull()
  })

  it('uses an explicitly configured minor-unit ceiling', () => {
    expect(resolveGoogleAdsBudgetSanityCeilingMinor({
      [ADS_ENV.googleAdsBudgetSanityCeilingMinor]: '250000',
    })).toBe(250000)
  })

  it('fails closed on malformed or non-positive configured ceilings', () => {
    expect(resolveGoogleAdsBudgetSanityCeilingMinor({
      [ADS_ENV.googleAdsBudgetSanityCeilingMinor]: 'not-a-number',
    })).toBe(0)
    expect(resolveGoogleAdsBudgetSanityCeilingMinor({
      [ADS_ENV.googleAdsBudgetSanityCeilingMinor]: '0',
    })).toBe(0)
  })
})
