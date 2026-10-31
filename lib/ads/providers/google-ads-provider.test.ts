import { describe, expect, it, vi } from 'vitest'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import {
  createGoogleAdsProvider,
  GOOGLE_ADS_SCOPE,
  type GoogleAdsApiCall,
  type GoogleAdsApiTransport,
} from '@/lib/ads/providers/google-ads-provider'

const REDIRECT_URI = 'https://gloval.ai/api/ads/google/callback'
const CONTEXT = { userId: '550e8400-e29b-41d4-a716-446655440000', connectionId: null }

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Google Ads provider', () => {
  it('builds an authorization URL with offline consent and PKCE', () => {
    const provider = createGoogleAdsProvider({ clientId: 'client-id' })
    const url = new URL(provider.buildAuthUrl({
      state: 'signed-state',
      redirectUri: REDIRECT_URI,
      codeChallenge: 'challenge-value',
    }))

    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('scope')).toBe(GOOGLE_ADS_SCOPE)
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('include_granted_scopes')).toBe('false')
    expect(url.searchParams.get('code_challenge')).toBe('challenge-value')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('exchanges a code with its verifier and requires the Ads scope and refresh token', async () => {
    const fetcherMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: GOOGLE_ADS_SCOPE,
    }))
    const provider = createGoogleAdsProvider({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: REDIRECT_URI,
      fetcher: fetcherMock as unknown as typeof fetch,
    })

    const tokens = await provider.exchangeCodeWithVerifier({
      code: 'oauth-code',
      redirectUri: REDIRECT_URI,
      codeVerifier: 'v'.repeat(43),
    })
    const request = fetcherMock.mock.calls[0]?.[1]
    const body = new URLSearchParams(String(request?.body))

    expect(body.get('code_verifier')).toBe('v'.repeat(43))
    expect(body.get('client_secret')).toBe('client-secret')
    expect(tokens).toMatchObject({ accessToken: 'access-token', refreshToken: 'refresh-token', scopes: [GOOGLE_ADS_SCOPE] })
    expect(tokens.expiresAt).toBeTruthy()

    const missingRefresh = createGoogleAdsProvider({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetcher: vi.fn(async () => response({
        access_token: 'access-token',
        token_type: 'Bearer',
        scope: GOOGLE_ADS_SCOPE,
      })) as unknown as typeof fetch,
    })
    await expect(missingRefresh.exchangeCodeWithVerifier({
      code: 'oauth-code',
      redirectUri: REDIRECT_URI,
      codeVerifier: 'v'.repeat(43),
    })).rejects.toMatchObject({ code: 'refresh_token_missing' })
  })

  it('maps invalid refresh grants to a reconnect requirement and keeps token rotation', async () => {
    const invalidProvider = createGoogleAdsProvider({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetcher: vi.fn(async () => response({ error: 'invalid_grant' }, 400)) as unknown as typeof fetch,
    })
    await expect(invalidProvider.refreshAccessTokenWithRotation('refresh-token'))
      .rejects.toMatchObject({ code: 'reauth_required' })

    const rotatedProvider = createGoogleAdsProvider({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetcher: vi.fn(async () => response({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 1800,
        token_type: 'Bearer',
      })) as unknown as typeof fetch,
    })
    await expect(rotatedProvider.refreshAccessTokenWithRotation('old-refresh')).resolves.toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    })
  })

  it('lists direct and MCC child accounts with the correct manager context', async () => {
    const calls: GoogleAdsApiCall[] = []
    const requestAdsApi: GoogleAdsApiTransport = async (call) => {
      calls.push(call)
      if (call.method === 'customers.listAccessibleCustomers') {
        return { resourceNames: ['customers/1111111111', 'customers/2222222222'] }
      }
      if (call.body?.query.includes('FROM customer_client')) {
        return [{ results: [{ customerClient: {
          clientCustomer: 'customers/3333333333',
          descriptiveName: 'Client account',
          currencyCode: 'USD',
          manager: false,
        } }] }]
      }
      const manager = call.path.includes('1111111111')
      const id = manager ? '1111111111' : '2222222222'
      return [{ results: [{ customer: {
        id,
        descriptiveName: manager ? 'Agency MCC' : 'Direct account',
        currencyCode: 'TRY',
        manager,
      } }] }]
    }
    const provider = createGoogleAdsProvider({ clientId: 'client-id', requestAdsApi })

    const accounts = await provider.listAccountsForUser('access-token', CONTEXT)
    expect(accounts).toHaveLength(3)
    expect(accounts.find((account) => account.externalAccountId === '1111111111')).toMatchObject({ isManager: true })
    expect(accounts.find((account) => account.externalAccountId === '2222222222')).toMatchObject({ isManager: false, loginCustomerId: null })
    expect(accounts.find((account) => account.externalAccountId === '3333333333')).toMatchObject({
      isManager: false,
      loginCustomerId: '1111111111',
      currency: 'USD',
    })
    expect(calls.filter((call) => call.loginCustomerId === '1111111111')).toHaveLength(1)
  })

  it('aggregates read-only campaign performance and keeps write methods disabled', async () => {
    const calls: GoogleAdsApiCall[] = []
    const requestAdsApi: GoogleAdsApiTransport = async (call) => {
      calls.push(call)
      return [{ results: [{
        campaign: { id: '123', name: 'Search campaign', status: 'ENABLED' },
        metrics: { impressions: '100', clicks: '12', costMicros: '2500000', conversions: 1.5 },
      }] }]
    }
    const provider = createGoogleAdsProvider({ clientId: 'client-id', requestAdsApi })
    const report = await provider.getPerformance({
      accessToken: 'access-token',
      customerId: '1234567890',
      loginCustomerId: '1111111111',
      range: '30d',
      currency: 'TRY',
      context: CONTEXT,
    })

    expect(report).toMatchObject({
      range: '30d',
      currency: 'TRY',
      totals: { impressions: 100, clicks: 12, costMicros: 2500000, conversions: 1.5 },
      campaigns: [{ id: '123', status: 'ENABLED' }],
    })
    expect(calls[0]?.body?.query).toContain('LAST_30_DAYS')
    await expect(provider.publishCampaign({} as never)).rejects.toMatchObject({ code: 'not_implemented' })
    await expect(provider.setCampaignStatus({} as never)).rejects.toMatchObject({ code: 'not_implemented' })
  })

  it('rejects API listing without a quota-bound user context', async () => {
    const provider = createGoogleAdsProvider({ clientId: 'client-id', requestAdsApi: async () => ({}) })
    await expect(provider.listAccounts('access-token')).rejects.toBeInstanceOf(GoogleAdsError)
  })
})
