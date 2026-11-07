// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  logEvent: vi.fn(),
  from: vi.fn(),
  updates: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock('@/lib/notify', () => ({ logUserEvent: (...args: unknown[]) => mocks.logEvent(...args) }))
vi.mock('@/lib/ads/meta-connections', () => ({
  listMetaConnectionsNearExpiry: (...args: unknown[]) => mocks.list(...args),
}))

import { GET } from './route'

const DAY = 86_400_000

function connection(id: string, expiresInMs: number, status: 'active' | 'error' = 'active') {
  return {
    id,
    userId: `user-${id}`,
    accountName: `Account ${id}`,
    externalAccountId: `act_${id}`,
    tokenExpiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    status,
  }
}

function request(authorization?: string) {
  return new Request('https://gloval.ai/api/cron/meta-token-expiry', {
    headers: authorization ? { authorization } : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'cron-secret')
  vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
  vi.stubEnv('ADS_FEATURE_UI', '1')
  mocks.updates = []
  mocks.from.mockImplementation(() => {
    const builder: Record<string, any> = {}
    builder.update = (patch: Record<string, unknown>) => {
      mocks.updates.push(patch)
      return builder
    }
    builder.eq = () => builder
    builder.then = (resolve: (result: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
    return builder
  })
  mocks.list.mockResolvedValue([])
  mocks.logEvent.mockResolvedValue(undefined)
})

afterEach(() => vi.unstubAllEnvs())

describe('GET /api/cron/meta-token-expiry', () => {
  it('rejects a wrong or missing bearer secret before reading any connection', async () => {
    expect((await GET(request('Bearer wrong'))).status).toBe(401)
    expect((await GET(request())).status).toBe(401)
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('answers 503 when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(request('Bearer '))).status).toBe(503)
  })

  it('skips quietly when the Ads feature is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '')
    vi.stubEnv('ADS_FEATURE_UI', '')
    const response = await GET(request('Bearer cron-secret'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, skipped: 'disabled' })
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('warns about a token that is about to expire without changing the connection', async () => {
    mocks.list.mockResolvedValue([connection('1', 3 * DAY)])
    const response = await GET(request('Bearer cron-secret'))

    expect(await response.json()).toEqual({ ok: true, checked: 1, notified: 1 })
    expect(mocks.updates).toHaveLength(0)
    expect(mocks.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      type: 'meta_ads_token_expiring',
    }))
  })

  it('flips an expired active connection to error, drops its token and sends the expired mail', async () => {
    mocks.list.mockResolvedValue([connection('2', -DAY)])
    const response = await GET(request('Bearer cron-secret'))

    expect(await response.json()).toEqual({ ok: true, checked: 1, notified: 1 })
    expect(mocks.updates).toEqual([{ status: 'error', refresh_token_enc: null, last_error: 'token_expired' }])
    expect(mocks.logEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'meta_ads_token_expired' }))
  })

  it('does not rewrite an already-errored connection but still dedupes its mail', async () => {
    mocks.list.mockResolvedValue([connection('3', -DAY, 'error')])
    await GET(request('Bearer cron-secret'))

    expect(mocks.updates).toHaveLength(0)
    expect(mocks.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      dedupeKey: expect.stringContaining('meta_token_expired_3_'),
    }))
  })

  it('ignores tokens that expire later than the warning window', async () => {
    mocks.list.mockResolvedValue([connection('4', 30 * DAY)])
    const response = await GET(request('Bearer cron-secret'))

    expect(await response.json()).toEqual({ ok: true, checked: 0, notified: 0 })
    expect(mocks.logEvent).not.toHaveBeenCalled()
  })

  it('keeps going when one notification fails', async () => {
    mocks.list.mockResolvedValue([connection('5', 2 * DAY), connection('6', 2 * DAY)])
    mocks.logEvent.mockRejectedValueOnce(new Error('mail down')).mockResolvedValueOnce(undefined)
    const response = await GET(request('Bearer cron-secret'))

    expect(await response.json()).toEqual({ ok: true, checked: 2, notified: 1 })
    expect(mocks.logEvent).toHaveBeenCalledTimes(2)
  })

  it('answers 503 when the connection query fails', async () => {
    mocks.list.mockRejectedValue(new Error('db down'))
    const response = await GET(request('Bearer cron-secret'))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'expiry_check_failed' })
  })
})
