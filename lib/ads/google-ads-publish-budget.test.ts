import { describe, expect, it } from 'vitest'
import { ADS_ENV, resolveGoogleAdsBudgetSanityCeilingMinor } from '@/lib/ads/env'

describe('optional Google Ads budget sanity ceiling', () => {
  it('allows uncapped budgets when the optional setting is absent', () => {
    expect(resolveGoogleAdsBudgetSanityCeilingMinor('TRY', {})).toBeNull()
  })

  it('reads optional currency-specific ceilings in minor units', () => {
    const env = { [ADS_ENV.googleAdsPublishDailyBudgetCapsMinor]: 'TRY=250000,USD=12000' }
    expect(resolveGoogleAdsBudgetSanityCeilingMinor('TRY', env)).toBe(250000)
    expect(resolveGoogleAdsBudgetSanityCeilingMinor('USD', env)).toBe(12000)
    expect(resolveGoogleAdsBudgetSanityCeilingMinor('EUR', env)).toBeNull()
  })

  it('rejects malformed, duplicate, zero, fractional, or unsafe configured ceilings', () => {
    for (const value of ['TRY=0', 'TRY=1.5', 'TRY=-4', 'TRY=nope', 'TRY=9007199254740992', 'TRY=1,TRY=2']) {
      expect(() => resolveGoogleAdsBudgetSanityCeilingMinor('TRY', { [ADS_ENV.googleAdsPublishDailyBudgetCapsMinor]: value })).toThrow()
    }
  })
})
