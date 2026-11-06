import { describe, expect, it } from 'vitest'
import { ADS_ENV, resolveGoogleAdsBudgetSanityCeilingMinor } from '@/lib/ads/env'

describe('optional Google Ads budget sanity ceiling', () => {
  it('allows uncapped budgets when the optional setting is absent', () => {
    expect(resolveGoogleAdsBudgetSanityCeilingMinor({})).toBeNull()
  })

  it('reads one optional ceiling in minor units', () => {
    expect(resolveGoogleAdsBudgetSanityCeilingMinor({ [ADS_ENV.googleAdsBudgetSanityCeilingMinor]: '250000' })).toBe(250000)
  })

  it('fails closed for malformed, zero, fractional, or unsafe configured ceilings', () => {
    for (const value of ['0', '1.5', '-4', 'not-a-number', '9007199254740992']) {
      expect(() => resolveGoogleAdsBudgetSanityCeilingMinor({ [ADS_ENV.googleAdsBudgetSanityCeilingMinor]: value })).toThrow()
    }
  })
})
