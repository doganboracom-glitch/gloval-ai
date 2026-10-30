import { describe, expect, it } from 'vitest'
import { isAdsFeatureUiEnabled, resolveAdsFeatureUi } from '@/lib/ads/feature-flag'

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
