import { describe, expect, it } from 'vitest'
import { ADS_ENV, resolveGoogleAdsPublishDailyBudgetCapMinor } from '@/lib/ads/env'

describe('Google Ads per-currency daily caps', () => {
  it('fails closed when the cap is absent, malformed, duplicated, or non-positive', () => {
    expect(resolveGoogleAdsPublishDailyBudgetCapMinor('TRY', {})).toBeNull()
    expect(resolveGoogleAdsPublishDailyBudgetCapMinor('TRY', { [ADS_ENV.googleAdsPublishDailyBudgetCapsMinor]: 'TRY=100,broken' })).toBeNull()
    expect(resolveGoogleAdsPublishDailyBudgetCapMinor('TRY', { [ADS_ENV.googleAdsPublishDailyBudgetCapsMinor]: 'TRY=100,TRY=200' })).toBeNull()
    expect(resolveGoogleAdsPublishDailyBudgetCapMinor('TRY', { [ADS_ENV.googleAdsPublishDailyBudgetCapsMinor]: 'TRY=0' })).toBeNull()
    expect(resolveGoogleAdsPublishDailyBudgetCapMinor('try', { [ADS_ENV.googleAdsPublishDailyBudgetCapsMinor]: 'TRY=100' })).toBeNull()
  })

  it('reads explicit minor-unit ceilings by currency without falling back across currencies', () => {
    const env = { [ADS_ENV.googleAdsPublishDailyBudgetCapsMinor]: 'TRY=250000,USD=12000' }
    expect(resolveGoogleAdsPublishDailyBudgetCapMinor('TRY', env)).toBe(250000)
    expect(resolveGoogleAdsPublishDailyBudgetCapMinor('USD', env)).toBe(12000)
    expect(resolveGoogleAdsPublishDailyBudgetCapMinor('EUR', env)).toBeNull()
  })
})
