import { describe, expect, it, vi } from 'vitest'
import {
  META_OPTIONAL_SCOPES,
  META_REQUESTED_SCOPES,
  META_REQUIRED_SCOPES,
  missingMetaOptionalScopes,
  missingMetaRequiredScopes,
} from '@/lib/ads/meta-ads-shared'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import type { MetaApiClient } from '@/lib/ads/meta-api-client'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { buildMetaAuthUrl, createMetaAdsProvider } from '@/lib/ads/providers/meta-ads-provider'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const context = { userId: USER_ID, connectionId: null }

function providerWith(request: MetaApiClient['request'], loginConfigId: string | null = null) {
  return createMetaAdsProvider({
    client: { request } as MetaApiClient,
    appId: '1234567890',
    appSecret: 'secret',
    apiVersion: 'v24.0',
    loginConfigId,
  })
}

describe('Meta izin kümeleri', () => {
  it('instagram_basic hiçbir listede yoktur', () => {
    const all = [...META_REQUIRED_SCOPES, ...META_OPTIONAL_SCOPES, ...META_REQUESTED_SCOPES] as string[]
    expect(all).not.toContain('instagram_basic')
  })

  it('zorunlu izinler ads_read, business_management ve pages_show_list; pages_read_engagement isteğe bağlıdır', () => {
    expect([...META_REQUIRED_SCOPES]).toEqual(['ads_read', 'business_management', 'pages_show_list'])
    expect([...META_OPTIONAL_SCOPES]).toEqual(['pages_read_engagement'])
  })

  it('eksik zorunlu izin bağlantıyı engelleyecek şekilde raporlanır', () => {
    expect(missingMetaRequiredScopes(['ads_read', 'pages_show_list'])).toEqual(['business_management'])
    expect(missingMetaRequiredScopes([...META_REQUIRED_SCOPES])).toEqual([])
  })

  it('eksik isteğe bağlı izin yalnızca bilgi olarak raporlanır', () => {
    expect(missingMetaOptionalScopes([...META_REQUIRED_SCOPES])).toEqual(['pages_read_engagement'])
    expect(missingMetaRequiredScopes([...META_REQUIRED_SCOPES])).toEqual([])
    expect(missingMetaOptionalScopes([...META_REQUESTED_SCOPES])).toEqual([])
  })
})

describe('Meta yetkilendirme adresi', () => {
  const base = { appId: '1234567890', apiVersion: 'v24.0', redirectUri: 'https://gloval.ai/api/ads/meta/callback', state: 'st' }

  it('scope modunda istenen izinleri gönderir ve instagram_basic içermez', () => {
    const url = new URL(buildMetaAuthUrl(base))
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v24.0/dialog/oauth')
    expect(url.searchParams.get('scope')).toBe('ads_read,business_management,pages_show_list,pages_read_engagement')
    expect(url.searchParams.get('scope')).not.toContain('instagram_basic')
    expect(url.searchParams.get('config_id')).toBeNull()
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('st')
  })

  it('config_id modunda scope göndermez ve yetki kodu yanıtını zorlar', () => {
    const url = new URL(buildMetaAuthUrl({ ...base, loginConfigId: '987654321012' }))
    expect(url.searchParams.get('config_id')).toBe('987654321012')
    expect(url.searchParams.get('scope')).toBeNull()
    expect(url.searchParams.get('override_default_response_type')).toBe('true')
  })

  it('sağlayıcı aynı adresi üretir', () => {
    const provider = providerWith(vi.fn(), '987654321012')
    const url = new URL(provider.buildAuthUrl({ redirectUri: base.redirectUri, state: 'st' } as never))
    expect(url.searchParams.get('config_id')).toBe('987654321012')
  })
})

describe('Meta sağlayıcı: Instagram hesapları', () => {
  it('reklam hesabının instagram_accounts ucunu okur ve geçerli kayıtları döner', async () => {
    const request = vi.fn(async () => ({
      data: [{ id: '17841400000000001', username: 'gloval' }, { id: 'bad id', username: 'x' }, { username: 'noid' }],
    }))
    const accounts = await providerWith(request).listInstagramAccounts({ accessToken: 'tok', accountId: 'act_1234567', context })
    expect(accounts).toEqual([{ id: '17841400000000001', username: 'gloval' }])
    expect((request.mock.calls[0] as unknown[])[0]).toMatchObject({ endpoint: 'act.instagram_accounts', path: '/act_1234567/instagram_accounts' })
  })

  it('Meta hata verirse boş liste döner (bağlantıyı bozmaz)', async () => {
    const request = vi.fn(async () => {
      throw new MetaAdsError('permission_missing')
    })
    await expect(providerWith(request).listInstagramAccounts({ accessToken: 'tok', accountId: 'act_1234567', context })).resolves.toEqual([])
  })

  it('geçersiz hesap kimliği için hiç istek yapmadan boş liste döner', async () => {
    const request = vi.fn()
    await expect(providerWith(request).listInstagramAccounts({ accessToken: 'tok', accountId: '../x', context })).resolves.toEqual([])
    expect(request).not.toHaveBeenCalled()
  })
})

describe('Meta sağlayıcı: belirteç denetimi', () => {
  it('uygulama kimliği eşleşmeyen belirteç geçersiz sayılır ve yalnızca güvenli kapsamlar döner', async () => {
    const request = vi.fn(async () => ({
      data: { is_valid: true, app_id: 'other-app', user_id: '42', scopes: ['ads_read', 'Bad Scope!', 'pages_show_list'], expires_at: 0 },
    }))
    const result = await providerWith(request).inspectToken({ accessToken: 'tok', context })
    expect(result.isValid).toBe(false)
    expect(result.scopes).toEqual(['ads_read', 'pages_show_list'])
    expect(result.expiresAt).toBeNull()
    expect((request.mock.calls[0] as unknown[])[0]).toMatchObject({ accessToken: '1234567890|secret' })
  })

  it('geçerli belirteçte son kullanma tarihi ISO olarak döner', async () => {
    const expires = Math.floor(Date.now() / 1000) + 3600
    const request = vi.fn(async () => ({ data: { is_valid: true, app_id: '1234567890', user_id: '42', scopes: ['ads_read'], expires_at: expires } }))
    const result = await providerWith(request).inspectToken({ accessToken: 'tok', context })
    expect(result).toMatchObject({ isValid: true, metaUserId: '42' })
    expect(result.expiresAt).toBe(new Date(expires * 1000).toISOString())
  })
})
