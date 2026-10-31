import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { ADS_ANON_COOKIE, issueAnonCookie } from '@/lib/ads/anon-identity'
import { handleScanRequest, type ScanHandlerEnv } from '@/lib/ads/scan-handler'
import { makeDeps } from '@/lib/ads/testing/scan-fixtures'

const SECRET = 'x'.repeat(40)

function setup(overrides: Partial<ScanHandlerEnv> = {}, cookie?: string) {
  process.env.ADS_ANON_HASH_SECRET = SECRET
  const { deps, calls } = makeDeps()
  const env: ScanHandlerEnv = {
    featureEnabled: true,
    getUser: async () => null,
    getCookie: (name) => (name === ADS_ANON_COOKIE ? cookie : undefined),
    deps,
    ...overrides,
  }
  return { env, calls }
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://gloval.ai/api/ads/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'gloval.ai', 'x-forwarded-for': '203.0.113.5', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const VALID = { address: 'ornekmutfak.com', requestId: 'req_12345678' }

describe('POST /api/ads/scan handler', () => {
  it('is a 404 while the feature flag is off', async () => {
    const { env } = setup({ featureEnabled: false })
    expect((await handleScanRequest(post(VALID), env)).status).toBe(404)
  })

  it('asks a visitor without a cookie to load the page first (428)', async () => {
    const { env, calls } = setup()
    const response = await handleScanRequest(post(VALID), env)
    expect(response.status).toBe(428)
    expect(await response.json()).toEqual({ error: { code: 'session_required' } })
    expect(calls.reserve).toBe(0)
  })

  it('runs the scan for a visitor with a valid cookie', async () => {
    const issued = issueAnonCookie({ ADS_ANON_HASH_SECRET: SECRET })!
    const { env } = setup({}, issued.value)
    const response = await handleScanRequest(post(VALID), env)
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.result.mode).toBe('free')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('accepts a signed-in user without a cookie and passes the normalized IP to policy limits', async () => {
    const { env } = setup({ getUser: async () => ({ userId: 'u1', planCode: 'free' }) })
    const reservePolicyAttempt = vi.fn(env.deps.reservePolicyAttempt)
    env.deps.reservePolicyAttempt = reservePolicyAttempt
    expect((await handleScanRequest(post(VALID), env)).status).toBe(200)
    expect(reservePolicyAttempt).toHaveBeenCalledWith(VALID.requestId, {
      kind: 'user',
      userId: 'u1',
      planCode: 'free',
      ip: '203.0.113.5',
    })
  })

  it('rejects malformed, oversized and cross-origin requests', async () => {
    const issued = issueAnonCookie({ ADS_ANON_HASH_SECRET: SECRET })!
    const { env } = setup({}, issued.value)
    expect((await handleScanRequest(post('{nope'), env)).status).toBe(400)
    expect((await handleScanRequest(post({ address: '', requestId: 'req_12345678' }), env)).status).toBe(400)
    expect((await handleScanRequest(post({ ...VALID, address: 'a'.repeat(3000) }), env)).status).toBe(400)
    expect((await handleScanRequest(post(VALID, { origin: 'https://evil.example' }), env)).status).toBe(400)
    expect((await handleScanRequest(post(VALID, { origin: 'https://gloval.ai' }), env)).status).toBe(200)
    expect((await handleScanRequest(post({ ...VALID, requestId: 'policy_12345678' }), env)).status).toBe(400)
  })

  it('fails closed for a visitor without a usable IP', async () => {
    const issued = issueAnonCookie({ ADS_ANON_HASH_SECRET: SECRET })!
    const { env } = setup({}, issued.value)
    const request = new Request('https://gloval.ai/api/ads/scan', {
      method: 'POST',
      headers: { host: 'gloval.ai' },
      body: JSON.stringify(VALID),
    })
    expect((await handleScanRequest(request, env)).status).toBe(503)
  })

  it('sends Retry-After with a rate-limit response', async () => {
    const issued = issueAnonCookie({ ADS_ANON_HASH_SECRET: SECRET })!
    const { env } = setup({}, issued.value)
    env.deps.rateLimit = () => ({ allowed: false, retryAfterMs: 4000 })
    const response = await handleScanRequest(post(VALID), env)
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('4')
  })
})
