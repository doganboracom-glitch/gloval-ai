import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { createMetaApiClient } from '@/lib/ads/meta-api-client'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const TOKEN = 'EAAGm0PX4ZCpsBAKsecrettoken1234567890'
const context = { userId: USER_ID, connectionId: null }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function graphError(code: number, status = 400, message = 'failure') {
  return json({ error: { message, type: 'OAuthException', code, fbtrace_id: 'trace' } }, status)
}

function setup(responses: Array<Response | Error>) {
  const queue = [...responses]
  const fetchImpl = vi.fn(async () => {
    const next = queue.shift()
    if (!next) throw new Error('no more responses')
    if (next instanceof Error) throw next
    return next
  })
  const reserveQuota = vi.fn(async () => true)
  const recordOutcome = vi.fn(async () => undefined)
  const sleep = vi.fn(async () => undefined)
  const log = vi.fn()
  const client = createMetaApiClient({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    reserveQuota,
    recordOutcome,
    sleep,
    log,
    apiVersion: 'v24.0',
  })
  return { client, fetchImpl, reserveQuota, recordOutcome, sleep, log }
}

async function failure(promise: Promise<unknown>): Promise<MetaAdsError> {
  try {
    await promise
  } catch (error) {
    return error as MetaAdsError
  }
  throw new Error('expected failure')
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('Meta Graph API istemcisi', () => {
  it('önce kota ayırır, sonra sürümlü adrese Bearer başlığıyla istek atar', async () => {
    const { client, fetchImpl, reserveQuota, recordOutcome } = setup([json({ data: [] })])
    const result = await client.request({ endpoint: 'me.adaccounts', path: '/me/adaccounts', accessToken: TOKEN, query: { fields: 'id' }, context })
    expect(result).toEqual({ data: [] })

    expect(reserveQuota).toHaveBeenCalledTimes(1)
    expect((reserveQuota.mock.calls[0] as unknown[])[0]).toMatchObject({ endpoint: 'me.adaccounts', userDailyLimit: 400, globalDailyLimit: 1500 })

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.toString()).toBe('https://graph.facebook.com/v24.0/me/adaccounts?fields=id')
    expect(url.toString()).not.toContain(TOKEN)
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(init.cache).toBe('no-store')
    expect(init.redirect).toBe('error')
    expect(recordOutcome).toHaveBeenCalledWith(expect.any(String), 'success', null)
  })

  it('kota dolduğunda Graph API çağrılmaz', async () => {
    const { client, fetchImpl, reserveQuota } = setup([json({})])
    reserveQuota.mockResolvedValueOnce(false)
    const error = await failure(client.request({ endpoint: 'me.accounts', path: '/me/accounts', accessToken: TOKEN, context }))
    expect(error.code).toBe('api_quota_exceeded')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('kota denetimi hata verirse istek yapılmaz', async () => {
    const { client, fetchImpl, reserveQuota } = setup([json({})])
    reserveQuota.mockRejectedValueOnce(new MetaAdsError('quota_check_failed'))
    const error = await failure(client.request({ endpoint: 'me.accounts', path: '/me/accounts', accessToken: TOKEN, context }))
    expect(error.code).toBe('quota_check_failed')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('günlük limitler ortam değişkeninden okunur', async () => {
    vi.stubEnv('META_READ_DAILY_USER_LIMIT', '12')
    vi.stubEnv('META_READ_DAILY_GLOBAL_LIMIT', '34')
    const { client, reserveQuota } = setup([json({})])
    await client.request({ endpoint: 'me.accounts', path: '/me/accounts', accessToken: TOKEN, context })
    expect((reserveQuota.mock.calls[0] as unknown[])[0]).toMatchObject({ userDailyLimit: 12, globalDailyLimit: 34 })
  })

  it('GET 5xx hatasında üstel gecikmeyle en fazla 3 deneme yapar', async () => {
    const { client, fetchImpl, sleep, recordOutcome } = setup([graphError(2, 500), graphError(2, 503), graphError(1, 500)])
    const error = await failure(client.request({ endpoint: 'act.insights', path: '/act_12345/insights', accessToken: TOKEN, context }))
    expect(error.code).toBe('provider_unavailable')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map((call) => (call as unknown[])[0])).toEqual([250, 500])
    expect(recordOutcome).toHaveBeenCalledWith(expect.any(String), 'error', 'provider_error')
  })

  it('geçici hata sonrası başarılı olursa sonuç döner', async () => {
    const { client, fetchImpl } = setup([graphError(2, 500), json({ ok: true })])
    await expect(client.request({ endpoint: 'act.account', path: '/act_12345', accessToken: TOKEN, context })).resolves.toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('ağ hatası yeniden denenir ve network_error olarak kaydedilir', async () => {
    const { client, fetchImpl, recordOutcome } = setup([new Error('boom'), new Error('boom'), new Error('boom')])
    const error = await failure(client.request({ endpoint: 'me.accounts', path: '/me/accounts', accessToken: TOKEN, context }))
    expect(error.code).toBe('provider_unavailable')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(recordOutcome).toHaveBeenCalledWith(expect.any(String), 'error', 'network_error')
  })

  it('POST isteği yeniden denenmez ve gövde formda gider (adreste sır yok)', async () => {
    const { client, fetchImpl } = setup([graphError(2, 500)])
    const error = await failure(client.request({
      endpoint: 'oauth.token',
      path: '/oauth/access_token',
      method: 'POST',
      form: { client_id: '1234567890', client_secret: 'super-app-secret', code: 'auth-code' },
      context,
    }))
    expect(error.code).toBe('provider_unavailable')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.toString()).not.toContain('super-app-secret')
    expect(String(init.body)).toContain('client_secret=super-app-secret')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded')
  })

  it.each([
    [190, 400, 'reauth_required', 'reauth_required'],
    [10, 403, 'permission_missing', 'permission_missing'],
    [200, 403, 'permission_missing', 'permission_missing'],
    [17, 400, 'rate_limited', 'rate_limited'],
    [613, 400, 'rate_limited', 'rate_limited'],
    [100, 400, 'provider_error', 'provider_error'],
  ])('Graph kodu %i yeniden denenmeden %s olarak sınıflanır', async (code, status, expectedCode, safeCode) => {
    const { client, fetchImpl, recordOutcome } = setup([graphError(code, status), json({})])
    const error = await failure(client.request({ endpoint: 'act.insights', path: '/act_12345/insights', accessToken: TOKEN, context }))
    expect(error.code).toBe(expectedCode)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(recordOutcome).toHaveBeenCalledWith(expect.any(String), 'error', safeCode)
  })

  it('hata günlüğü ve hata nesnesi belirteç veya ham gövde içermez', async () => {
    const message = `Invalid token ${TOKEN} for jane@example.com`
    const { client, log } = setup([graphError(190, 400, message)])
    const error = await failure(client.request({ endpoint: 'me.accounts', path: '/me/accounts', accessToken: TOKEN, context }))

    const logged = log.mock.calls.map((call) => String(call[0])).join('\n')
    expect(logged).toContain('endpoint=me.accounts')
    expect(logged).toContain('code=190')
    expect(logged).not.toContain(TOKEN)
    expect(logged).not.toContain('jane@example.com')
    expect(logged).not.toContain('trace')

    expect(JSON.stringify(error.detail)).not.toContain(TOKEN)
    expect(JSON.stringify(error.detail)).not.toContain('jane@example.com')
    expect(error.detail).toMatchObject({ code: 190, type: 'OAuthException' })
  })

  it('izin verilmeyen uç nokta ve tehlikeli yolları reddeder', async () => {
    const { client, fetchImpl, reserveQuota } = setup([json({})])
    const base = { accessToken: TOKEN, context }
    expect((await failure(client.request({ ...base, endpoint: 'evil' as never, path: '/me' }))).code).toBe('invalid_request')
    expect((await failure(client.request({ ...base, endpoint: 'me.accounts', path: '/me/../admin' }))).code).toBe('invalid_request')
    expect((await failure(client.request({ ...base, endpoint: 'me.accounts', path: 'me/accounts' }))).code).toBe('invalid_request')
    expect((await failure(client.request({ ...base, endpoint: 'me.accounts', path: '//evil.com/x' }))).code).toBe('invalid_request')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(reserveQuota).not.toHaveBeenCalled()
  })

  it('sonuç kaydı başarısız olsa bile istek sonucu etkilenmez', async () => {
    const { client, recordOutcome, log } = setup([json({ data: [] })])
    recordOutcome.mockRejectedValueOnce(new Error('db down'))
    await expect(client.request({ endpoint: 'me.accounts', path: '/me/accounts', accessToken: TOKEN, context })).resolves.toEqual({ data: [] })
    expect(log).toHaveBeenCalledWith('[meta-ads] outcome record failed')
  })
})
