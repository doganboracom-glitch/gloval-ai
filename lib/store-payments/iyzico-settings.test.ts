import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createAdmin: vi.fn(),
  rateLimit: vi.fn(),
  testConnection: vi.fn(),
  loadCreds: vi.fn(),
  readSecrets: vi.fn(),
  row: { current: null as unknown },
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdmin }))
vi.mock('@/lib/crypto', () => ({ encryptSecret: (v: string) => `enc:${v}` }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rateLimit }))
vi.mock('@/lib/store-payments/owner-auth', () => ({ authorizeProjectOwner: mocks.authorize }))
vi.mock('@/lib/store-payments/secrets-store', () => ({ readStoredSecrets: mocks.readSecrets }))
vi.mock('@/lib/store-payments/iyzico-credentials', async () => {
  const actual = await vi.importActual<typeof import('@/lib/store-payments/iyzico-credentials')>(
    '@/lib/store-payments/iyzico-credentials',
  )
  return { ...actual, loadIyzicoCredentials: mocks.loadCreds }
})
vi.mock('@/lib/store-payments/iyzico', () => ({ testIyzicoConnection: mocks.testConnection }))

import {
  getIyzicoSettings,
  saveIyzicoSettings,
  testIyzicoConnectionAction,
} from '@/lib/store-payments/iyzico-settings'

const API_KEY = 'AK-very-secret-api-key'
const SECRET_KEY = 'SK-very-secret-secret-key'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.row.current = {
    public_config: { iyzico: { environment: 'sandbox', tested: 'true' } },
    secret_encrypted: 'ciphertext',
  }
  mocks.authorize.mockResolvedValue({ ownerId: 'owner-1', actorId: 'owner-1' })
  mocks.rateLimit.mockReturnValue({ allowed: true })
  mocks.readSecrets.mockReturnValue({ iyzico: { api_key: API_KEY, secret_key: SECRET_KEY } })
  mocks.createAdmin.mockImplementation(() => {
    const api = {
      select: () => api,
      eq: () => api,
      update: () => api,
      insert: async () => ({ error: null }),
      maybeSingle: async () => ({ data: mocks.row.current, error: null }),
      then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
    }
    return { from: () => api }
  })
})

describe('iyzico settings (owner panel)', () => {
  it('rejects an unauthorized caller before any service-role access', async () => {
    mocks.authorize.mockRejectedValue(new Error('UNAUTHENTICATED'))
    await expect(getIyzicoSettings('p1')).rejects.toThrow('UNAUTHENTICATED')
    await expect(
      saveIyzicoSettings('p1', { apiKey: 'a', secretKey: 'b', environment: 'sandbox' }),
    ).rejects.toThrow()
    await expect(testIyzicoConnectionAction('p1')).rejects.toThrow()
    expect(mocks.createAdmin).not.toHaveBeenCalled()
    expect(mocks.testConnection).not.toHaveBeenCalled()
  })

  it('the view reports presence only and never carries a key', async () => {
    const view = await getIyzicoSettings('p1')
    expect(view).toMatchObject({ apiKeyPresent: true, secretKeyPresent: true, tested: true, environment: 'sandbox' })
    const text = JSON.stringify(view)
    expect(text).not.toContain(API_KEY)
    expect(text).not.toContain(SECRET_KEY)
    expect(view.returnUrl).toContain('/api/store/payment-return/iyzico/p1')
  })

  it('a save result never echoes the submitted keys', async () => {
    const res = await saveIyzicoSettings('p1', { apiKey: 'NEW-api-key', secretKey: 'NEW-secret-key', environment: 'live' })
    expect(res.ok).toBe(true)
    const text = JSON.stringify(res)
    expect(text).not.toContain('NEW-api-key')
    expect(text).not.toContain('NEW-secret-key')
    expect(text).not.toContain(API_KEY)
  })

  it('accepts only the two fixed environments (no free URL)', async () => {
    for (const environment of ['https://evil.example.com', 'http://169.254.169.254', 'prod', '']) {
      const res = await saveIyzicoSettings('p1', { apiKey: 'a', secretKey: 'b', environment })
      expect(res).toEqual({ ok: false, error: 'invalid_environment' })
    }
    expect((await saveIyzicoSettings('p1', { apiKey: 'a', secretKey: 'b', environment: 'live' })).ok).toBe(true)
    expect((await saveIyzicoSettings('p1', { apiKey: 'a', secretKey: 'b', environment: 'sandbox' })).ok).toBe(true)
  })

  it('rejects malformed keys', async () => {
    const res = await saveIyzicoSettings('p1', { apiKey: 'has space', secretKey: 'b', environment: 'sandbox' })
    expect(res).toEqual({ ok: false, error: 'invalid_keys' })
  })

  it('the connection test is rate limited per store and never reaches iyzico when limited', async () => {
    mocks.rateLimit.mockReturnValue({ allowed: false })
    expect(await testIyzicoConnectionAction('p1')).toEqual({ ok: false, error: 'rate_limited' })
    expect(mocks.testConnection).not.toHaveBeenCalled()
  })

  it('a failed test returns a coarse error and no raw iyzico data or keys', async () => {
    mocks.loadCreds.mockResolvedValue({
      ok: true,
      creds: { apiKey: API_KEY, secretKey: SECRET_KEY, environment: 'sandbox' },
    })
    mocks.testConnection.mockResolvedValue({ ok: false, error: 'auth' })
    const res = await testIyzicoConnectionAction('p1')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('auth')
    const text = JSON.stringify(res)
    expect(text).not.toContain(API_KEY)
    expect(text).not.toContain(SECRET_KEY)
  })
})
