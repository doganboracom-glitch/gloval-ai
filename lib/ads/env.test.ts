import { describe, expect, it } from 'vitest'
import {
  isGoogleAdsConnectPublic,
  resolveGoogleAdsAccess,
  resolveGoogleAdsAccessMode,
  resolveGoogleAdsConnectAccess,
  resolveGoogleAdsKillSwitch,
  resolveGoogleAdsMaxActiveConnections,
  resolveGoogleAdsPublishLimits,
  resolveGoogleAdsOAuthSettings,
  resolveGoogleAdsPublishAccess,
  resolveGoogleAdsReadDailyLimits,
  resolveGoogleAdsValidateOnlyTestEnabled,
} from '@/lib/ads/env'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_USER_ID = '123e4567-e89b-42d3-a456-426614174000'

const OAUTH_ENV = {
  GOOGLE_ADS_OAUTH_CLIENT_ID: 'client-id',
  GOOGLE_ADS_OAUTH_CLIENT_SECRET: 'client-secret',
  ADS_OAUTH_STATE_SECRET: 'state-secret-with-at-least-thirty-two-characters',
}
const VERIFIED_IDENTITY = { emailConfirmed: true, isAdmin: false }

describe('Google Ads access configuration', () => {
  it('requires a separate explicit enable flag and a matching user UUID allowlist', () => {
    expect(resolveGoogleAdsConnectAccess(USER_ID, {
      ADS_GOOGLE_CONNECT_ENABLED: '1',
      ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS: ` ${OTHER_USER_ID}, ${USER_ID.toUpperCase()} `,
    }, VERIFIED_IDENTITY)).toBe(true)

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

  it('opens read-only connect access to any authenticated UUID only when both strict flags are enabled', () => {
    const publicEnv = {
      ADS_GOOGLE_CONNECT_ENABLED: '1',
      ADS_GOOGLE_CONNECT_PUBLIC: '1',
      ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS: '',
    }

    expect(isGoogleAdsConnectPublic(publicEnv)).toBe(true)
    expect(resolveGoogleAdsConnectAccess(OTHER_USER_ID, publicEnv)).toBe(false)
    expect(resolveGoogleAdsConnectAccess(OTHER_USER_ID, publicEnv, VERIFIED_IDENTITY)).toBe(true)
    expect(resolveGoogleAdsConnectAccess(null, publicEnv)).toBe(false)
    expect(resolveGoogleAdsConnectAccess('not-a-uuid', publicEnv)).toBe(false)
    expect(resolveGoogleAdsConnectAccess(USER_ID, { ...publicEnv, ADS_GOOGLE_CONNECT_ENABLED: '0' })).toBe(false)
    expect(resolveGoogleAdsConnectAccess(USER_ID, { ...publicEnv, ADS_GOOGLE_CONNECT_PUBLIC: 'true' })).toBe(false)
    expect(resolveGoogleAdsConnectAccess(USER_ID, {
      ...publicEnv,
      ADS_GOOGLE_CONNECT_PUBLIC: '0',
      ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS: USER_ID,
    }, VERIFIED_IDENTITY)).toBe(true)
  })

  it('uses bounded connection and daily-read defaults without changing environment values', () => {
    expect(resolveGoogleAdsMaxActiveConnections({})).toBe(3)
    expect(resolveGoogleAdsReadDailyLimits({})).toEqual({ perUser: 200, global: 2_000 })
    expect(resolveGoogleAdsMaxActiveConnections({ ADS_GOOGLE_CONNECT_MAX_ACTIVE_CONNECTIONS: '5' })).toBe(5)
    expect(resolveGoogleAdsReadDailyLimits({
      ADS_GOOGLE_READ_DAILY_USER_LIMIT: '250',
      ADS_GOOGLE_READ_DAILY_GLOBAL_LIMIT: '2879',
    })).toEqual({ perUser: 250, global: 2_879 })
    expect(resolveGoogleAdsMaxActiveConnections({ ADS_GOOGLE_CONNECT_MAX_ACTIVE_CONNECTIONS: '101' })).toBe(3)
    expect(resolveGoogleAdsReadDailyLimits({
      ADS_GOOGLE_READ_DAILY_USER_LIMIT: '0',
      ADS_GOOGLE_READ_DAILY_GLOBAL_LIMIT: '2880',
    })).toEqual({ perUser: 200, global: 2_000 })
  })

  it('fails closed when the enable flag or allowlist is absent or malformed', () => {
    expect(resolveGoogleAdsConnectAccess(USER_ID, {})).toBe(false)
    expect(resolveGoogleAdsConnectAccess(USER_ID, {
      ADS_GOOGLE_CONNECT_ENABLED: '1',
      ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS: 'not-a-uuid,another-value',
    })).toBe(false)
  })

  it('supports open, allowlist, off, verified-email, and admin access decisions', () => {
    const verified = { emailConfirmed: true, isAdmin: false }
    const openEnv = { GOOGLE_ADS_ACCESS_MODE: 'open', GOOGLE_ADS_PUBLISH_ENABLED: '1' }
    expect(resolveGoogleAdsAccess(USER_ID, verified, openEnv)).toEqual({
      mode: 'open', canConnect: true, canPublish: true, isAdmin: false,
    })
    expect(resolveGoogleAdsAccess(USER_ID, { ...verified, emailConfirmed: false }, openEnv).canConnect).toBe(false)
    expect(resolveGoogleAdsAccessMode({ GOOGLE_ADS_ACCESS_MODE: 'unexpected' })).toBe('off')

    const allowlistEnv = {
      GOOGLE_ADS_ACCESS_MODE: 'allowlist',
      ADS_GOOGLE_CONNECT_ENABLED: '1',
      ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS: USER_ID,
      GOOGLE_ADS_PUBLISH_ENABLED: '1',
      GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS: USER_ID,
    }
    expect(resolveGoogleAdsAccess(USER_ID, verified, allowlistEnv).canPublish).toBe(true)
    expect(resolveGoogleAdsAccess(USER_ID, { emailConfirmed: false, isAdmin: false }, allowlistEnv).canConnect).toBe(false)
    expect(resolveGoogleAdsAccess(OTHER_USER_ID, verified, allowlistEnv).canConnect).toBe(false)

    const adminDecision = resolveGoogleAdsAccess(USER_ID, { emailConfirmed: false, isAdmin: true }, {
      GOOGLE_ADS_ACCESS_MODE: 'off',
      GOOGLE_ADS_PUBLISH_ENABLED: '1',
    })
    expect(adminDecision).toEqual({ mode: 'off', canConnect: true, canPublish: true, isAdmin: true })
  })

  it('keeps publish kill switch and rate caps strict with bounded safe defaults', () => {
    expect(resolveGoogleAdsKillSwitch({ GOOGLE_ADS_KILL_SWITCH: '1' })).toBe(true)
    expect(resolveGoogleAdsKillSwitch({ GOOGLE_ADS_KILL_SWITCH: 'true' })).toBe(false)
    expect(resolveGoogleAdsPublishLimits({})).toEqual({
      maxActiveCampaignsPerUser: 2,
      dailyAttemptsPerUser: 5,
      dailyAttemptsGlobal: 100,
    })
    expect(resolveGoogleAdsPublishLimits({
      GOOGLE_ADS_MAX_ACTIVE_CAMPAIGNS_PER_USER: '3',
      GOOGLE_ADS_PUBLISH_DAILY_USER_LIMIT: '20',
      GOOGLE_ADS_PUBLISH_DAILY_GLOBAL_LIMIT: '500',
    })).toEqual({
      maxActiveCampaignsPerUser: 3,
      dailyAttemptsPerUser: 20,
      dailyAttemptsGlobal: 500,
    })
    expect(resolveGoogleAdsPublishLimits({ GOOGLE_ADS_MAX_ACTIVE_CAMPAIGNS_PER_USER: '11' }).maxActiveCampaignsPerUser).toBe(2)
  })

  it('keeps publishing disabled unless both explicit gates are configured', () => {
    expect(resolveGoogleAdsPublishAccess(USER_ID, {})).toBe(false)
    expect(resolveGoogleAdsPublishAccess(USER_ID, {
      ADS_GOOGLE_CONNECT_ENABLED: '1',
      ADS_GOOGLE_CONNECT_PUBLIC: '1',
    })).toBe(false)
    expect(resolveGoogleAdsPublishAccess(USER_ID, {
      GOOGLE_ADS_PUBLISH_ENABLED: 'true',
      GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS: USER_ID,
    })).toBe(false)
    expect(resolveGoogleAdsPublishAccess(USER_ID, {
      GOOGLE_ADS_PUBLISH_ENABLED: '1',
      GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS: '',
    })).toBe(false)
    expect(resolveGoogleAdsPublishAccess(USER_ID, {
      GOOGLE_ADS_PUBLISH_ENABLED: '1',
      GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS: OTHER_USER_ID,
    })).toBe(false)
    expect(resolveGoogleAdsPublishAccess(USER_ID, {
      ADS_GOOGLE_CONNECT_ENABLED: '1',
      ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS: ` ${OTHER_USER_ID}, ${USER_ID.toUpperCase()} `,
      GOOGLE_ADS_PUBLISH_ENABLED: '1',
      GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS: ` ${OTHER_USER_ID}, ${USER_ID.toUpperCase()} `,
    }, VERIFIED_IDENTITY)).toBe(true)
  })

  it('keeps the separate validate-only test gate closed unless the strict environment flag is set', () => {
    expect(resolveGoogleAdsValidateOnlyTestEnabled({})).toBe(false)
    expect(resolveGoogleAdsValidateOnlyTestEnabled({ GOOGLE_ADS_VALIDATE_ONLY_TEST_ENABLED: 'true' })).toBe(false)
    expect(resolveGoogleAdsValidateOnlyTestEnabled({ GOOGLE_ADS_VALIDATE_ONLY_TEST_ENABLED: '1' })).toBe(true)
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
