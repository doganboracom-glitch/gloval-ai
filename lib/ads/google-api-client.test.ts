import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

function mutateCall(overrides: Partial<GoogleAdsApiCall> = {}): GoogleAdsApiCall {
  return call({
    method: 'googleAds.mutate',
    path: 'customers/1234567890/googleAds:mutate',
    body: {
      mutateOperations: [
        { campaignBudgetOperation: { create: { amountMicros: '150000000' } } },
        { campaignOperation: { create: { status: 'PAUSED' } } },
        { campaignCriterionOperation: { create: { negative: false } } },
      ],
      partialFailure: false,
      validateOnly: true,
    },
    ...overrides,
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('ADS_GOOGLE_CONNECT_ENABLED', '')
  vi.stubEnv('ADS_GOOGLE_CONNECT_PUBLIC', '')
  vi.stubEnv('ADS_GOOGLE_READ_DAILY_USER_LIMIT', '')
  vi.stubEnv('ADS_GOOGLE_READ_DAILY_GLOBAL_LIMIT', '')
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
      p_user_daily_limit: 400,
      p_global_daily_limit: 1500,
    }))
    const init = fetcherMock.mock.calls[0]?.[1]
    const headers = new Headers(init?.headers)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ query: 'SELECT campaign.id FROM campaign' })
    expect(headers.get('authorization')).toBe('Bearer private-access-token')
    expect(headers.get('login-customer-id')).toBe('1111111111')
    expect(headers.has('developer-token')).toBe(false)
  })

  it('caps configured read limits to the 600/user and 1,800/project bucket', async () => {
    vi.stubEnv('ADS_GOOGLE_READ_DAILY_USER_LIMIT', '900')
    vi.stubEnv('ADS_GOOGLE_READ_DAILY_GLOBAL_LIMIT', '2400')
    const fetcher = vi.fn(async () => jsonResponse([{ results: [] }])) as unknown as typeof fetch
    const transport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher })

    await transport(call())

    expect(mocks.rpc).toHaveBeenCalledWith('ads_reserve_google_api_operation', expect.objectContaining({
      p_user_daily_limit: 600,
      p_global_daily_limit: 1800,
    }))
  })

  it('fails closed when the six-argument daily quota RPC is missing', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
    const fetcher = vi.fn(async () => jsonResponse([{ results: [] }])) as unknown as typeof fetch
    const transport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher })

    await expect(transport(call())).rejects.toMatchObject({ code: 'quota_check_failed' })

    expect(mocks.rpc).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledWith('ads_reserve_google_api_operation', expect.objectContaining({
      p_user_daily_limit: 400,
      p_global_daily_limit: 1500,
    }))
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fails closed when public access or custom limits require the missing daily-quota SQL function', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
    vi.stubEnv('ADS_GOOGLE_CONNECT_ENABLED', '1')
    vi.stubEnv('ADS_GOOGLE_CONNECT_PUBLIC', '1')
    const publicFetcher = vi.fn(async () => jsonResponse([{ results: [] }])) as unknown as typeof fetch
    const publicTransport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher: publicFetcher })

    await expect(publicTransport(call())).rejects.toMatchObject({ code: 'quota_check_failed' })
    expect(mocks.rpc).toHaveBeenCalledOnce()
    expect(publicFetcher).not.toHaveBeenCalled()

    mocks.rpc.mockReset().mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
    vi.stubEnv('ADS_GOOGLE_CONNECT_PUBLIC', '0')
    vi.stubEnv('ADS_GOOGLE_READ_DAILY_USER_LIMIT', '150')
    const customFetcher = vi.fn(async () => jsonResponse([{ results: [] }])) as unknown as typeof fetch
    const customTransport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher: customFetcher })

    await expect(customTransport(call())).rejects.toMatchObject({ code: 'quota_check_failed' })
    expect(mocks.rpc).toHaveBeenCalledOnce()
    expect(customFetcher).not.toHaveBeenCalled()
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

  it('reserves geo-target suggestions through v2 while keeping search on the six-argument RPC', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ geoTargetConstantSuggestions: [] })) as unknown as typeof fetch
    const transport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher })

    await transport(call({
      method: 'geoTargetConstants.suggest',
      path: 'geoTargetConstants:suggest',
      body: { locale: 'en', countryCode: 'US', locationNames: { names: ['Boston'] } },
    }))

    expect(mocks.rpc).toHaveBeenCalledWith('ads_reserve_google_api_operation_v2', expect.objectContaining({
      p_method: 'geoTargetConstants.suggest',
      p_operation_count: 1,
    }))
    expect(fetcher).toHaveBeenCalledOnce()
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

  it('maps a missing EU political declaration to a user-correctable reason without auto-declaring', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      error: {
        status: 'INVALID_ARGUMENT',
        message: 'Campaign is missing its EU political advertising declaration.',
        details: [{
          errors: [{ errorCode: { campaignError: 'MISSING_EU_POLITICAL_ADVERTISING_DECLARATION' } }],
        }],
      },
    }, 400)) as unknown as typeof fetch
    const transport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher })

    await expect(transport(mutateCall())).rejects.toMatchObject({ code: 'eu_political_declaration_required' })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it.each([
    ['CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION', 403, { status: 'PERMISSION_DENIED', message: 'Cloud project is not approved for production.', details: [{ errors: [{ errorCode: { authorizationError: 'CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION' } }] }] }],
    ['ACTION_NOT_PERMITTED', 403, { status: 'PERMISSION_DENIED', message: 'Action not permitted.', details: [{ errors: [{ errorCode: { authorizationError: 'ACTION_NOT_PERMITTED' } }] }] }],
    ['AUTHORIZATION_ERROR', 403, { status: 'PERMISSION_DENIED', message: 'Authorization error.', details: [{ errors: [{ errorCode: { authorizationError: 'AUTHORIZATION_ERROR' } }] }] }],
    ['AUTHORIZATION_ERROR (HTTP 400)', 400, { status: 'INVALID_ARGUMENT', message: 'x', details: [{ errors: [{ errorCode: { authorizationError: 'AUTHORIZATION_ERROR' } }] }] }],
  ])('classifies Google %s as google_access_level_insufficient without retrying', async (_name, status, error) => {
    const fetcher = vi.fn(async () => jsonResponse({ error }, status)) as unknown as typeof fetch
    const transport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher })

    await expect(transport(call())).rejects.toMatchObject({ code: 'google_access_level_insufficient' })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('keeps a plain 403 without an access-level code as not_authorized', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error: { status: 'PERMISSION_DENIED', message: 'Denied.' } }, 403)) as unknown as typeof fetch
    const transport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher })

    await expect(transport(call())).rejects.toMatchObject({ code: 'not_authorized' })
  })

  it('reserves every individual mutation operation before a single external request', async () => {
    const fetcherMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ mutateOperationResponses: [] }))
    const fetcher = fetcherMock as unknown as typeof fetch
    const transport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher })

    await transport(mutateCall())

    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('ads_reserve_google_api_operation_v2', expect.objectContaining({
      p_user_id: CONTEXT.userId,
      p_connection_id: CONTEXT.connectionId,
      p_method: 'googleAds.mutate',
      p_operation_count: 3,
    }))
    expect(fetcher).toHaveBeenCalledTimes(1)
    const init = fetcherMock.mock.calls[0]?.[1]
    expect(JSON.parse(String(init?.body))).toMatchObject({ validateOnly: true, partialFailure: false })
  })

  it('fails closed on mutation quota denial and rejects partial-failure bodies before reserving', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ allowed: false, global_used: 2399, user_used: 119 }], error: null })
    const fetcher = vi.fn(async () => jsonResponse({})) as unknown as typeof fetch
    const transport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher })

    await expect(transport(mutateCall())).rejects.toMatchObject({ code: 'api_quota_exceeded' })
    expect(fetcher).not.toHaveBeenCalled()

    mocks.rpc.mockClear()
    const invalidBody = {
      mutateOperations: [{ campaignOperation: { create: { status: 'PAUSED' } } }],
      partialFailure: true,
      validateOnly: false,
    } as unknown as GoogleAdsApiCall['body']
    await expect(transport(mutateCall({ body: invalidBody }))).rejects.toMatchObject({ code: 'invalid_request' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('never retries a mutate after an ambiguous network failure', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch
    const transport = createGoogleAdsApiTransport({ userId: CONTEXT.userId, connectionId: CONTEXT.connectionId, fetcher })

    await expect(transport(mutateCall({ body: {
      mutateOperations: [{ campaignOperation: { create: { status: 'PAUSED' } } }],
      partialFailure: false,
      validateOnly: false,
    } }))).rejects.toMatchObject({ code: 'provider_unavailable' })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
