import { describe, expect, it } from 'vitest'
import {
  canDisconnectGoogleAdsConnection,
  isGoogleAdsConnectAllowed,
  parseGoogleAdsConnectAllowedUserIds,
  resolveGoogleAdsConnectEnabled,
} from '@/lib/ads/google-ads-gate'

const ALLOWED_USER = 'b0b25d6f-55be-4fa8-97a4-53619a2a1284'
const OTHER_USER = '058da5a9-43ca-4bb8-a537-b1e64c5099bd'

describe('Google Ads connection gate', () => {
  it('defaults to disabled and rejects all users when the feature flag is off', () => {
    expect(resolveGoogleAdsConnectEnabled({})).toBe(false)
    expect(isGoogleAdsConnectAllowed(ALLOWED_USER, {
      GOOGLE_ADS_CONNECT_ALLOWED_USER_IDS: ALLOWED_USER,
    })).toBe(false)
  })

  it.each(['1', 'true', 'TRUE'])('enables only for a UUID in the allowlist when set to %j', (value) => {
    const env = {
      GOOGLE_ADS_CONNECT_ENABLED: value,
      GOOGLE_ADS_CONNECT_ALLOWED_USER_IDS: ` ${ALLOWED_USER.toUpperCase()} ,invalid, ${OTHER_USER}`,
    }

    expect(isGoogleAdsConnectAllowed(ALLOWED_USER, env)).toBe(true)
    expect(isGoogleAdsConnectAllowed(OTHER_USER, env)).toBe(true)
    expect(isGoogleAdsConnectAllowed('not-a-uuid', env)).toBe(false)
  })

  it('rejects a valid but non-allowlisted user and ignores malformed allowlist entries', () => {
    const env = {
      GOOGLE_ADS_CONNECT_ENABLED: '1',
      GOOGLE_ADS_CONNECT_ALLOWED_USER_IDS: `${ALLOWED_USER},someone@example.com`,
    }

    expect(isGoogleAdsConnectAllowed(OTHER_USER, env)).toBe(false)
    expect(parseGoogleAdsConnectAllowedUserIds(env.GOOGLE_ADS_CONNECT_ALLOWED_USER_IDS)).toEqual(new Set([ALLOWED_USER]))
  })

  it('allows disconnecting an owned connection even when the feature is disabled', () => {
    expect(canDisconnectGoogleAdsConnection(true)).toBe(true)
    expect(canDisconnectGoogleAdsConnection(false)).toBe(false)
  })
})
