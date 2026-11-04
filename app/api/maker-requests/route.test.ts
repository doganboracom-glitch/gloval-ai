import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getRequestUser: vi.fn(),
  enqueueMakerRequestEmails: vi.fn(),
  resolveRateLimitIp: vi.fn(),
  checkMakerRequestEmailLimit: vi.fn(),
  checkMakerRequestIpLimit: vi.fn(),
  insertedRows: [] as unknown[],
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/supabase/request-user', () => ({ getRequestUser: mocks.getRequestUser }))
vi.mock('@/lib/maker-requests/outbox', () => ({ enqueueMakerRequestEmails: mocks.enqueueMakerRequestEmails }))
vi.mock('@/lib/custom-domains/public-search/limits', () => ({ resolveRateLimitIp: mocks.resolveRateLimitIp }))
vi.mock('@/lib/maker-requests/rate-limit', () => ({
  checkMakerRequestEmailLimit: mocks.checkMakerRequestEmailLimit,
  checkMakerRequestIpLimit: mocks.checkMakerRequestIpLimit,
}))

import { POST } from './route'

const REQUEST_ID = '456e7890-e89b-42d3-a456-426614174000'
const USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const IP = '203.0.113.18'

const validPayload = {
  fullName: 'Derya Yılmaz',
  phone: '+90 555 123 45 67',
  email: 'derya@example.net',
  budgetRange: '10000-25000',
  referenceLinks: ['https://example.com'],
  consent: true,
  companyWebsite: '',
  lang: 'tr',
}

function post(body: unknown) {
  return new Request('https://gloval.ai/api/maker-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv('MAKER_REQUESTS_ENABLED', '1')
  vi.stubEnv('STORE_ORDER_TOKEN_SECRET', 'test-only-maker-request-secret')
  mocks.insertedRows.length = 0
  mocks.resolveRateLimitIp.mockReturnValue(IP)
  mocks.checkMakerRequestIpLimit.mockReturnValue({ allowed: true, retryAfterMs: 0 })
  mocks.checkMakerRequestEmailLimit.mockReturnValue({ allowed: true, retryAfterMs: 0 })
  mocks.getRequestUser.mockResolvedValue({ kind: 'unauthenticated' })
  mocks.enqueueMakerRequestEmails.mockResolvedValue(undefined)
  mocks.createAdminClient.mockImplementation(() => ({
    from: () => ({
      insert: (row: unknown) => {
        mocks.insertedRows.push(row)
        return {
          select: () => ({ single: async () => ({ data: { id: REQUEST_ID }, error: null }) }),
        }
      },
    }),
  }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('POST /api/maker-requests', () => {
  it('stores a validated guest request, hashes the IP, and queues notifications', async () => {
    const response = await POST(post(validPayload))
    const payload = await response.json()
    const row = mocks.insertedRows[0] as Record<string, unknown>

    expect(response.status).toBe(201)
    expect(payload).toEqual({ ok: true })
    expect(row.user_id).toBeNull()
    expect(row.ip_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(row.ip_hash).not.toContain(IP)
    expect(row.reference_links).toEqual(['https://example.com/'])
    expect(mocks.enqueueMakerRequestEmails).toHaveBeenCalledWith(REQUEST_ID, 'tr')
  })

  it('associates an authenticated request with the current account', async () => {
    mocks.getRequestUser.mockResolvedValue({
      kind: 'authenticated',
      user: { id: USER_ID, email: 'derya@example.net', user_metadata: {} },
    })

    await POST(post(validPayload))

    expect((mocks.insertedRows[0] as Record<string, unknown>).user_id).toBe(USER_ID)
  })

  it('returns a fake success for a filled honeypot without storing or notifying', async () => {
    const response = await POST(post({ ...validPayload, companyWebsite: 'spam.example' }))

    expect(response.status).toBe(201)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.enqueueMakerRequestEmails).not.toHaveBeenCalled()
  })

  it('returns 429 with Retry-After when the IP limit is reached', async () => {
    mocks.checkMakerRequestIpLimit.mockReturnValue({ allowed: false, retryAfterMs: 27_001 })

    const response = await POST(post(validPayload))

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('28')
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('keeps the endpoint disabled unless the feature flag is exactly 1', async () => {
    vi.stubEnv('MAKER_REQUESTS_ENABLED', 'true')

    const response = await POST(post(validPayload))

    expect(response.status).toBe(404)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
})
