import { describe, expect, it } from 'vitest'
import { resolveGoogleAdsConnectAccess, resolveGoogleAdsOAuthSettings } from '@/lib/ads/env'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_USER_ID = '123e4567-e89b-42d3-a456-426614174000'

const OAUTH_ENV = {
  GOOGLE_ADS_OAUTH_CLIENT_ID: 'client-id',
  GOOGLE_ADS_OAUTH_CLIENT_SECRET: 'client-secret',
  ADS_OAUTH_STATE_SECRET: 'state-secret-with-at-least-thirty-two-characters',
}

describe('Google Ads access configuration', () => {
  it('requires a separate explicit enable flag and a matching user UUID allowlist', () => {
    expect(resolveGoogleAdsConnectAccess(USER_ID, {
      ADS_GOOGLE_CONNECT_ENABLED: '1',
      ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS: ` ${OTHER_USER_ID}, ${USER_ID.toUpperCase()} `,
    })).toBe(true)

    expect(resolveGoogleAdsConnectAccess(USER_ID, {
      ADS_GOOGLE_CONNECT_ENABLED: 'true',
      ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS: USER_ID,
    })).toBe(false)
    expect(resolveGoogleAdsConnectAccess(USER_ID, {
      ADS_GOOGLE_CONNECT_ENABLED: '1',
      ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS: OTHER_USER_ID,
    })).toBe(false)
    expect(resolveGoogleAdsConnectAccess(null, {
      ADS_GOOGLE_CONNECT_ENABLED: '1',
      ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS: USER_ID,
    })).toBe(false)
  })

  it('fails closed when the enable flag or allowlist is absent or malformed', () => {
    expect(resolveGoogleAdsConnectAccess(USER_ID, {})).toBe(false)
    expect(resolveGoogleAdsConnectAccess(USER_ID, {
      ADS_GOOGLE_CONNECT_ENABLED: '1',
      ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS: 'not-a-uuid,another-value',
    })).toBe(false)
  })

  it('resolves OAuth without any developer-token setting', () => {
    const result = resolveGoogleAdsOAuthSettings(OAUTH_ENV)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.settings).toEqual({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        stateSecret: OAUTH_ENV.ADS_OAUTH_STATE_SECRET,
        redirectUri: 'https://gloval.ai/api/ads/google/callback',
      })
      expect('developerToken' in result.settings).toBe(false)
    }
  })
})
