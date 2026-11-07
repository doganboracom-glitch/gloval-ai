// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  disconnect: vi.fn(),
  rateAllowed: true,
  configured: true,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: mocks.userId ? { id: mocks.userId, email: 'owner@example.com', email_confirmed_at: '2026-01-01T00:00:00.000Z' } : null },
        error: null,
      }),
    },
  }),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: mocks.rateAllowed }) }))
vi.mock('@/lib/ads/meta-connections', () => ({
  disconnectMetaConnection: (...args: unknown[]) => mocks.disconnect(...args),
}))
vi.mock('@/lib/ads/meta-provider-factory', () => ({
  createConfiguredMetaProvider: () =>
    mocks.configured
      ? { ok: true, stateSecret: 'x'.repeat(32), apiVersion: 'v24.0', loginMode: 'scope', provider: { name: 'meta-provider' } }
      : { ok: false, reason: 'configuration_missing' },
}))

import { POST } from './route'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const CONNECTION_ID = '987e6543-e21b-42d3-a456-426614174000'

function postRequest(body: unknown, headers: Record<string, string> = { origin: 'https://gloval.ai' }) {
  return new Request('https://gloval.ai/api/ads/meta/disconnect', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
  vi.stubEnv('ADS_FEATURE_UI', '1')
  vi.stubEnv('META_ADS_ACCESS_MODE', 'allowlist')
  vi.stubEnv('META_ADS_ALLOWED_USER_IDS', USER_ID)
  vi.stubEnv('META_ADS_KILL_SWITCH', '')
  mocks.userId = USER_ID
  mocks.rateAllowed = true
  mocks.configured = true
  mocks.disconnect.mockResolvedValue(undefined)
})

afterEach(() => vi.unstubAllEnvs())

describe('POST /api/ads/meta/disconnect', () => {
  it('disconnects the connection owned by the caller', async () => {
    const response = await POST(postRequest({ connectionId: CONNECTION_ID }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(mocks.disconnect).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID, connectionId: CONNECTION_ID }))
  })

  it('stays available while the kill switch is on', async () => {
    vi.stubEnv('META_ADS_KILL_SWITCH', '1')
    const response = await POST(postRequest({ connectionId: CONNECTION_ID }))

    expect(response.status).toBe(200)
    expect(mocks.disconnect).toHaveBeenCalledTimes(1)
  })

  it('stays available to a previously connected user who is no longer allowlisted but access mode is not off', async () => {
    mocks.userId = OTHER_USER_ID
    const response = await POST(postRequest({ connectionId: CONNECTION_ID }))

    expect(response.status).toBe(200)
    expect(mocks.disconnect).toHaveBeenCalledWith(expect.objectContaining({ userId: OTHER_USER_ID }))
  })

  it('answers 404 when the access mode is off', async () => {
    vi.stubEnv('META_ADS_ACCESS_MODE', 'off')
    const response = await POST(postRequest({ connectionId: CONNECTION_ID }))

    expect(response.status).toBe(404)
    expect(mocks.disconnect).not.toHaveBeenCalled()
  })

  it('rejects cross-origin and origin-less posts', async () => {
    expect((await POST(postRequest({ connectionId: CONNECTION_ID }, { origin: 'https://evil.example' }))).status).toBe(403)
    expect((await POST(postRequest({ connectionId: CONNECTION_ID }, {}))).status).toBe(403)
    expect(mocks.disconnect).not.toHaveBeenCalled()
  })

  it('requires a signed-in user', async () => {
    mocks.userId = null
    expect((await POST(postRequest({ connectionId: CONNECTION_ID }))).status).toBe(401)
  })

  it('rate limits per user', async () => {
    mocks.rateAllowed = false
    expect((await POST(postRequest({ connectionId: CONNECTION_ID }))).status).toBe(429)
  })

  it('rejects a malformed body or connection id', async () => {
    expect((await POST(postRequest('not json'))).status).toBe(400)
    expect((await POST(postRequest({ connectionId: 'nope' }))).status).toBe(400)
    expect((await POST(postRequest({}))).status).toBe(400)
    expect(mocks.disconnect).not.toHaveBeenCalled()
  })

  it('answers 503 when Meta is not configured', async () => {
    mocks.configured = false
    const response = await POST(postRequest({ connectionId: CONNECTION_ID }))
    expect(response.status).toBe(503)
    expect((await response.json()).error).toBe('configuration_missing')
  })

  it('maps connection_not_found to 404 and unknown failures to disconnect_failed', async () => {
    mocks.disconnect.mockRejectedValueOnce(new MetaAdsError('connection_not_found'))
    expect((await POST(postRequest({ connectionId: CONNECTION_ID }))).status).toBe(404)

    mocks.disconnect.mockRejectedValueOnce(new Error('boom'))
    const response = await POST(postRequest({ connectionId: CONNECTION_ID }))
    expect(response.status).toBe(503)
    expect((await response.json()).error).toBe('disconnect_failed')
  })
})
