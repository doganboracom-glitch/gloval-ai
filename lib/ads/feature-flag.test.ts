import { describe, expect, it } from 'vitest'
import { isAdsFeatureUiEnabled, resolveAdsFeatureUi } from '@/lib/ads/feature-flag'
import { resolvePolicyBlockedDailyCap } from '@/lib/ads/env'

describe('ADS_POLICY_BLOCKED_DAILY_CAP', () => {
  it('defaults to 60 and accepts a positive configured value', () => {
    expect(resolvePolicyBlockedDailyCap({})).toBe(60)
    expect(resolvePolicyBlockedDailyCap({ ADS_POLICY_BLOCKED_DAILY_CAP: '120' })).toBe(120)
    expect(resolvePolicyBlockedDailyCap({ ADS_POLICY_BLOCKED_DAILY_CAP: ' 8 ' })).toBe(8)
  })

  it.each(['', '0', '-1', '1.5', '1000000', 'unlimited'])('falls back for invalid value %j', (value) => {
    expect(resolvePolicyBlockedDailyCap({ ADS_POLICY_BLOCKED_DAILY_CAP: value })).toBe(60)
  })
})

describe('ADS_FEATURE_UI', () => {
  it.each(['1', 'true', 'TRUE', ' 1 '])('turns on for the explicit value %j', (value) => {
    expect(resolveAdsFeatureUi({ ADS_FEATURE_UI: value })).toBe(true)
  })

  it.each([undefined, '', '0', 'false', 'yes', 'on', 'enabled'])('stays off for %j', (value) => {
    expect(resolveAdsFeatureUi({ ADS_FEATURE_UI: value })).toBe(false)
  })

  it.each(['production', 'preview', 'development'])('has no default-on environment (%s)', (vercelEnv) => {
    expect(resolveAdsFeatureUi({ VERCEL_ENV: vercelEnv, NODE_ENV: 'development' })).toBe(false)
  })

  it('reads the build-time public mirror and is off unless it is exactly 1', () => {
    expect(isAdsFeatureUiEnabled('1')).toBe(true)
    expect(isAdsFeatureUiEnabled('0')).toBe(false)
    expect(isAdsFeatureUiEnabled('true')).toBe(false)
    expect(isAdsFeatureUiEnabled(undefined)).toBe(false)
  })
})
