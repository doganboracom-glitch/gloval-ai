import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoogleAdsApiCall } from '@/lib/ads/providers/google-ads-provider'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}))

import { createGoogleAdsApiTransport } from '@/lib/ads/google-api-client'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'

const CONTEXT = { userId: '550e8400-e29b-41d4-a716-446655440000', connectionId: '123e4567-e89b-42d3-a456-426614174000' }

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

function call(overrides: Partial<GoogleAdsApiCall> = {}): GoogleAdsApiCall {
  return {
    method: 'googleAds.searchStream',
    path: 'customers/1234567890/googleAds:searchStream',
    accessToken: 'private-access-token',
    loginCustomerId: '1111111111',
    body: { query: 'SELECT campaign.id FROM campaign' },
    context: CONTEXT,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({ data: [{ allowed: true, global_used: 1, user_used: 1 }], error: null })
  mocks.from.mockImplementation(() => ({
    update: () => ({ eq: async () => ({ error: null }) }),
  }))
})

describe('Google Ads API quota transport', () => {
  it('reserves each API operation before sending and never sends a developer-token header', async () => {
    const fetcherMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse([{ results: [] }]))
    const transport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher: fetcherMock as unknown as typeof fetch })

    await transport(call())

    expect(mocks.rpc).toHaveBeenCalledWith('ads_reserve_google_api_operation', expect.objectContaining({
      p_user_id: CONTEXT.userId,
      p_connection_id: CONTEXT.connectionId,
      p_method: 'googleAds.searchStream',
    }))
    const init = fetcherMock.mock.calls[0]?.[1]
    const headers = new Headers(init?.headers)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ query: 'SELECT campaign.id FROM campaign' })
    expect(headers.get('authorization')).toBe('Bearer private-access-token')
    expect(headers.get('login-customer-id')).toBe('1111111111')
    expect(headers.has('developer-token')).toBe(false)
  })

  it('sends accessible-customer discovery as GET without a body', async () => {
    const fetcherMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ resourceNames: [] }))
    const transport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: null, fetcher: fetcherMock as unknown as typeof fetch })

    await transport(call({
      method: 'customers.listAccessibleCustomers',
      path: 'customers:listAccessibleCustomers',
      loginCustomerId: null,
      body: undefined,
      context: { userId: CONTEXT.userId, connectionId: null },
    }))

    const [url, init] = fetcherMock.mock.calls[0] ?? []
    expect(String(url)).toBe('https://googleads.googleapis.com/v26/customers:listAccessibleCustomers')
    expect(init?.method).toBe('GET')
    expect(init?.body).toBeUndefined()
    expect(new Headers(init?.headers).has('content-type')).toBe(false)
  })

  it('fails closed when the atomic quota reservation is denied', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ allowed: false, global_used: 2400, user_used: 120 }], error: null })
    const fetcher = vi.fn(async () => jsonResponse({ results: [] })) as unknown as typeof fetch
    const transport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher })

    await expect(transport(call())).rejects.toMatchObject({ code: 'api_quota_exceeded' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reserves a fresh request id for each bounded transient retry', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ allowed: true }], error: null })
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { status: 'RESOURCE_TEMPORARILY_EXHAUSTED' } }, 429, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(jsonResponse([{ results: [] }])) as unknown as typeof fetch
    const transport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher })

    await transport(call())

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    const firstId = mocks.rpc.mock.calls[0]?.[1]?.p_request_id
    const secondId = mocks.rpc.mock.calls[1]?.[1]?.p_request_id
    expect(firstId).not.toBe(secondId)
  })

  it('does not retry a hard daily quota error and rejects paths outside the read-only allowlist', async () => {
    const quotaFetcher = vi.fn(async () => jsonResponse({ error: { status: 'RESOURCE_EXHAUSTED' } }, 429)) as unknown as typeof fetch
    const quotaTransport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher: quotaFetcher })
    await expect(quotaTransport(call())).rejects.toMatchObject({ code: 'api_quota_exceeded' })
    expect(quotaFetcher).toHaveBeenCalledTimes(1)

    mocks.rpc.mockClear()
    const restrictedTransport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher: quotaFetcher })
    await expect(restrictedTransport(call({ method: 'googleAds.search', path: 'customers/1234567890/googleAds:mutate' })))
      .rejects.toBeInstanceOf(GoogleAdsError)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects mismatched caller context before making an external request', async () => {
    const fetcher = vi.fn(async () => jsonResponse({})) as unknown as typeof fetch
    const transport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher })
    await expect(transport(call({ context: { userId: 'another-user', connectionId: CONTEXT.connectionId } })))
      .rejects.toMatchObject({ code: 'invalid_request' })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
