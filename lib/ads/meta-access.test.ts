import { describe, expect, it } from 'vitest'
import {
  META_GRAPH_API_VERSION_DEFAULT,
  resolveMetaAdsAccess,
  resolveMetaAdsAccessMode,
  resolveMetaAdsAppSettings,
  resolveMetaAdsKillSwitch,
  resolveMetaGraphApiVersion,
  resolveMetaLoginConfigId,
  resolveMetaRedirectUri,
} from '@/lib/ads/env'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const VERIFIED = { emailConfirmed: true, isAdmin: false }

describe('Meta Ads erişim kapısı', () => {
  it('ayar yoksa kapalıdır ve kimse bağlanamaz', () => {
    expect(resolveMetaAdsAccessMode({})).toBe('off')
    expect(resolveMetaAdsAccess(USER_ID, VERIFIED, {})).toEqual({ mode: 'off', canConnect: false, isAdmin: false })
  })

  it('bilinmeyen mod değeri kapalı sayılır (fail closed)', () => {
    expect(resolveMetaAdsAccessMode({ META_ADS_ACCESS_MODE: 'everyone' })).toBe('off')
    expect(resolveMetaAdsAccess(USER_ID, VERIFIED, { META_ADS_ACCESS_MODE: 'everyone' }).canConnect).toBe(false)
  })

  it('allowlist modunda yalnızca listedeki kullanıcı bağlanabilir', () => {
    const env = { META_ADS_ACCESS_MODE: 'allowlist', META_ADS_ALLOWED_USER_IDS: ` ${USER_ID.toUpperCase()} , ${OTHER_USER_ID}` }
    expect(resolveMetaAdsAccess(USER_ID, VERIFIED, env).canConnect).toBe(true)
    expect(resolveMetaAdsAccess(OTHER_USER_ID, VERIFIED, env).canConnect).toBe(true)
    expect(resolveMetaAdsAccess('99999999-9999-4999-8999-999999999999', VERIFIED, env).canConnect).toBe(false)
  })

  it('allowlist modunda listede olmayan yönetici bağlanabilir', () => {
    const env = { META_ADS_ACCESS_MODE: 'allowlist', META_ADS_ALLOWED_USER_IDS: OTHER_USER_ID }
    const decision = resolveMetaAdsAccess(USER_ID, { emailConfirmed: true, isAdmin: true }, env)
    expect(decision.canConnect).toBe(true)
    expect(decision.isAdmin).toBe(true)
  })

  it('açık modda doğrulanmış her kullanıcı bağlanabilir', () => {
    expect(resolveMetaAdsAccess(USER_ID, VERIFIED, { META_ADS_ACCESS_MODE: 'open' })).toEqual({
      mode: 'open',
      canConnect: true,
      isAdmin: false,
    })
  })

  it('e-postası doğrulanmamış kullanıcı açık modda bile bağlanamaz', () => {
    const env = { META_ADS_ACCESS_MODE: 'open' }
    expect(resolveMetaAdsAccess(USER_ID, { emailConfirmed: false, isAdmin: false }, env).canConnect).toBe(false)
    expect(resolveMetaAdsAccess(USER_ID, { emailConfirmed: false, isAdmin: true }, env).canConnect).toBe(false)
  })

  it('geçersiz veya boş kullanıcı kimliği hiçbir modda bağlanamaz', () => {
    const env = { META_ADS_ACCESS_MODE: 'open' }
    expect(resolveMetaAdsAccess(null, VERIFIED, env).canConnect).toBe(false)
    expect(resolveMetaAdsAccess('not-a-uuid', { emailConfirmed: true, isAdmin: true }, env).canConnect).toBe(false)
  })

  it('kill switch yalnızca "1" değeriyle etkinleşir', () => {
    expect(resolveMetaAdsKillSwitch({ META_ADS_KILL_SWITCH: '1' })).toBe(true)
    expect(resolveMetaAdsKillSwitch({ META_ADS_KILL_SWITCH: 'true' })).toBe(false)
    expect(resolveMetaAdsKillSwitch({})).toBe(false)
  })
})

describe('Meta Ads ayarları', () => {
  const ENV = {
    META_APP_ID: '1234567890',
    META_APP_SECRET: 'app-secret',
    ADS_OAUTH_STATE_SECRET: 'state-secret-with-at-least-thirty-two-characters',
  }

  it('eksik uygulama bilgisi configuration_missing döner', () => {
    expect(resolveMetaAdsAppSettings({})).toEqual({ ok: false, reason: 'configuration_missing' })
    expect(resolveMetaAdsAppSettings({ ...ENV, META_APP_ID: 'abc' }).ok).toBe(false)
    expect(resolveMetaAdsAppSettings({ ...ENV, ADS_OAUTH_STATE_SECRET: 'short' }).ok).toBe(false)
  })

  it('config_id yoksa scope modu, geçerliyse config_id modu seçilir', () => {
    const scope = resolveMetaAdsAppSettings(ENV)
    expect(scope.ok && scope.settings.loginConfigId).toBeNull()
    const configured = resolveMetaAdsAppSettings({ ...ENV, META_LOGIN_CONFIG_ID: '987654321012' })
    expect(configured.ok && configured.settings.loginConfigId).toBe('987654321012')
  })

  it('bozuk config_id yok sayılır, böylece yetkilendirme adresine sızmaz', () => {
    expect(resolveMetaLoginConfigId({ META_LOGIN_CONFIG_ID: '12&scope=evil' })).toBeNull()
  })

  it('Graph sürümü sabittir; geçersiz geçersiz kılma varsayılana döner', () => {
    expect(resolveMetaGraphApiVersion({})).toBe(META_GRAPH_API_VERSION_DEFAULT)
    expect(resolveMetaGraphApiVersion({ META_GRAPH_API_VERSION: 'v25.0' })).toBe('v25.0')
    expect(resolveMetaGraphApiVersion({ META_GRAPH_API_VERSION: 'latest' })).toBe(META_GRAPH_API_VERSION_DEFAULT)
  })

  it('yönlendirme adresi https ister; http yalnızca geliştirmede localhost için kabul edilir', () => {
    expect(resolveMetaRedirectUri('https://gloval.ai/api/ads/meta/connect')).toBe('https://gloval.ai/api/ads/meta/callback')
    expect(resolveMetaRedirectUri('http://gloval.ai/x')).toBeNull()
    expect(resolveMetaRedirectUri('not a url')).toBeNull()
  })
})
