import { describe, expect, it } from 'vitest'
import { resolveMetaAdsOAuthSettings } from '@/lib/ads/env'
import { inspectMetaToken } from '@/lib/ads/meta-graph'
import { buildMetaAuthUrl, checkMetaGrantedPermissions, META_REQUIRED_PERMISSIONS, resolveMetaLoginMode } from '@/lib/ads/meta-oauth'

const BASE = {
  appId: '123456789',
  redirectUri: 'https://gloval.ai/api/ads/meta/callback',
  state: 'signed.state',
}

describe('buildMetaAuthUrl', () => {
  it('config_id modunda scope göndermez, config_id ve override ekler', () => {
    const url = new URL(buildMetaAuthUrl({ ...BASE, loginConfigId: '987654321012' }))
    const p = url.searchParams
    expect(p.get('config_id')).toBe('987654321012')
    expect(p.get('override_default_response_type')).toBe('true')
    expect(p.get('response_type')).toBe('code')
    expect(p.get('redirect_uri')).toBe(BASE.redirectUri)
    expect(p.get('state')).toBe(BASE.state)
    expect(p.has('scope')).toBe(false)
  })

  it('scope modunda mevcut scope listesini kullanır, config_id eklemez', () => {
    const url = new URL(buildMetaAuthUrl({ ...BASE, loginConfigId: null }))
    const p = url.searchParams
    expect(p.get('scope')).toBe('ads_read,business_management,pages_show_list,instagram_basic')
    expect(p.has('config_id')).toBe(false)
    expect(p.has('override_default_response_type')).toBe(false)
    expect(p.get('response_type')).toBe('code')
    expect(p.get('redirect_uri')).toBe(BASE.redirectUri)
    expect(p.get('state')).toBe(BASE.state)
  })
})

describe('resolveMetaAdsOAuthSettings', () => {
  const env = {
    META_APP_ID: '123456789',
    META_APP_SECRET: 'secret',
    ADS_OAUTH_STATE_SECRET: 'x'.repeat(32),
  }

  it('META_LOGIN_CONFIG_ID tanımsızsa scope moduna düşer', () => {
    const r = resolveMetaAdsOAuthSettings(env)
    expect(r.ok && r.settings.loginConfigId).toBe(null)
    expect(resolveMetaLoginMode(null)).toBe('scope')
  })

  it('META_LOGIN_CONFIG_ID tanımlıysa config_id moduna geçer', () => {
    const r = resolveMetaAdsOAuthSettings({ ...env, META_LOGIN_CONFIG_ID: ' 987654321012 ' })
    expect(r.ok && r.settings.loginConfigId).toBe('987654321012')
    expect(resolveMetaLoginMode('987654321012')).toBe('config_id')
  })

  it('hatalı config id sessizce scope moduna düşmez', () => {
    const r = resolveMetaAdsOAuthSettings({ ...env, META_LOGIN_CONFIG_ID: 'abc' })
    expect(r).toEqual({ ok: false, reason: 'login_config_invalid' })
  })

  it('eksik app ayarında configuration_missing döner', () => {
    expect(resolveMetaAdsOAuthSettings({})).toEqual({ ok: false, reason: 'configuration_missing' })
  })
})

describe('checkMetaGrantedPermissions', () => {
  const all = [...META_REQUIRED_PERMISSIONS, 'public_profile']

  it.each(['scope', 'config_id'] as const)('%s modunda tüm izinler varsa geçer', (mode) => {
    expect(checkMetaGrantedPermissions(mode, all)).toEqual({ ok: true, missing: [] })
  })

  it('scope modunda eksik izni bildirir', () => {
    const r = checkMetaGrantedPermissions('scope', ['ads_read', 'pages_show_list'])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('missing_permissions')
      expect(r.missing).toEqual(['business_management', 'instagram_basic'])
    }
  })

  it('config_id modunda net yapılandırma mesajı verir', () => {
    const r = checkMetaGrantedPermissions('config_id', ['ads_read'])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('login_config_missing_permissions')
      expect(r.message).toContain('Meta bağlantı yapılandırması eksik izin veriyor')
      expect(r.message).toContain('business_management')
    }
  })
})

describe('inspectMetaToken', () => {
  it('scopes ve granular_scopes izinlerini birleştirir', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({
        data: {
          is_valid: true,
          app_id: '123456789',
          scopes: ['ads_read'],
          granular_scopes: [{ scope: 'pages_show_list', target_ids: ['1'] }, { scope: 'ads_read' }],
        },
      }))) as unknown as typeof fetch
    const r = await inspectMetaToken({ appId: '123456789', appSecret: 's', accessToken: 't' }, fetchImpl)
    expect(r?.valid).toBe(true)
    expect(r?.grantedPermissions.sort()).toEqual(['ads_read', 'pages_show_list'])
  })
})
