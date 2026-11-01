import { afterEach, describe, expect, it, vi } from 'vitest'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import {
  createGoogleAdsProvider,
  GOOGLE_ADS_SCOPE,
  type GoogleAdsApiCall,
  type GoogleAdsApiTransport,
} from '@/lib/ads/providers/google-ads-provider'
import type { AdsCampaignPublishInput } from '@/lib/ads/providers/types'
import type { GoogleAdsMutateRequest } from '@/lib/ads/google-ads-publish-plan'

const REDIRECT_URI = 'https://gloval.ai/api/ads/google/callback'
const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const CONNECTION_ID = '123e4567-e89b-42d3-a456-426614174000'
const CONTEXT = { userId: USER_ID, connectionId: null }
const PUBLISH_CONTEXT = { userId: USER_ID, connectionId: CONNECTION_ID }
const PLAN_ID = '123e4567-e89b-42d3-a456-426614174001'
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174002'

const PUBLISH_PLAN = {
  brand: 'Atölye Sitesi',
  sector: 'services',
  sectorLabel: 'Web Hizmetleri',
  services: ['Kurumsal site tasarımı', 'Web bakım hizmeti'],
  language: 'tr',
  languageFallback: false,
  competitiveness: 'medium',
  keywords: ['kurumsal web tasarımı', 'web sitesi hizmeti', 'web tasarım ajansı'],
  negativeKeywords: ['ücretsiz şablon'],
  country: 'TR',
  cities: ['İstanbul'],
  modelPolicyCategory: null,
  modelPolicyEvidence: 'none',
  finalUrl: 'https://gloval.example/hizmetler',
  adCopy: {
    headlines: ['Atölye Sitesi', 'Kurumsal Web Tasarımı', 'Web Bakım Hizmeti'],
    descriptions: ['Kurumsal web tasarım hizmetlerini keşfedin.', 'Web siteniz için bakım desteği alın.'],
    displayUrl: 'https://gloval.example/web-tasarim/kurumsal',
  },
}

function publishInput(overrides: Record<string, unknown> = {}) {
  return {
    externalAccountId: '1234567890',
    loginCustomerId: '1111111111',
    accessToken: 'access-token',
    context: PUBLISH_CONTEXT,
    planId: PLAN_ID,
    requestId: REQUEST_ID,
    budget: { currency: 'TRY', dailyMinor: 15000, capMinor: 90000 },
    planJson: PUBLISH_PLAN,
    validateOnly: false,
    ...overrides,
  }
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllEnvs())

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
      if (call.body && 'query' in call.body && call.body.query.includes('FROM customer_client')) {
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

  it('aggregates read-only campaign performance', async () => {
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
    const queryBody = calls[0]?.body
    expect(queryBody && 'query' in queryBody ? queryBody.query : '').toContain('LAST_30_DAYS')
  })

  it('creates campaigns PAUSED from stored plan JSON and warns when billing is unverified', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '1')
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS', USER_ID)
    const calls: GoogleAdsApiCall[] = []
    const requestAdsApi: GoogleAdsApiTransport = async (call) => {
      calls.push(call)
      if (call.method === 'googleAds.mutate') {
        return { mutateOperationResponses: [{}, { campaignResult: { resourceName: 'customers/1234567890/campaigns/456789' } }] }
      }
      return [{ results: [] }]
    }
    const provider = createGoogleAdsProvider({ clientId: 'client-id', requestAdsApi })

    const result = await provider.publishCampaign(publishInput() as AdsCampaignPublishInput)
    const mutateCall = calls.find((call) => call.method === 'googleAds.mutate')
    const body = mutateCall?.body as GoogleAdsMutateRequest | undefined
    const campaignOperation = body?.mutateOperations.find((operation) => 'campaignOperation' in operation)

    expect(result).toMatchObject({
      externalCampaignId: '456789',
      status: 'paused',
      validateOnly: false,
      billingVerified: false,
      paymentMethodWarning: true,
    })
    expect(body?.partialFailure).toBe(false)
    expect(body?.validateOnly).toBe(false)
    expect((campaignOperation?.campaignOperation as { create: { status: string } }).create.status).toBe('PAUSED')
    expect(mutateCall?.body).not.toHaveProperty('campaign')
  })

  it('supports Google Ads validate_only without returning a campaign id', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '1')
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS', USER_ID)
    const calls: GoogleAdsApiCall[] = []
    const requestAdsApi: GoogleAdsApiTransport = async (call) => {
      calls.push(call)
      return call.method === 'googleAds.mutate' ? {} : [{ results: [] }]
    }
    const provider = createGoogleAdsProvider({ clientId: 'client-id', requestAdsApi })

    const result = await provider.publishCampaign(publishInput({ validateOnly: true }) as AdsCampaignPublishInput)
    const mutateCall = calls.find((call) => call.method === 'googleAds.mutate')
    const body = mutateCall?.body as GoogleAdsMutateRequest | undefined

    expect(result).toMatchObject({ externalCampaignId: null, validateOnly: true, status: 'paused' })
    expect(body?.validateOnly).toBe(true)
  })

  it('fails closed when publishing is disabled and never calls Google Ads', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '0')
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS', USER_ID)
    const requestAdsApi = vi.fn(async () => ({}))
    const provider = createGoogleAdsProvider({ clientId: 'client-id', requestAdsApi })

    await expect(provider.publishCampaign(publishInput() as AdsCampaignPublishInput))
      .rejects.toMatchObject({ code: 'publish_disabled' })
    expect(requestAdsApi).not.toHaveBeenCalled()
  })

  it('warns on go-live when billing cannot be verified and keeps status actions credit-free', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '1')
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS', USER_ID)
    const calls: GoogleAdsApiCall[] = []
    const requestAdsApi: GoogleAdsApiTransport = async (call) => {
      calls.push(call)
      return call.method === 'googleAds.searchStream' ? [{ results: [] }] : {}
    }
    const provider = createGoogleAdsProvider({ clientId: 'client-id', requestAdsApi })

    const result = await provider.setCampaignStatus({
      externalAccountId: '1234567890',
      loginCustomerId: null,
      accessToken: 'access-token',
      context: PUBLISH_CONTEXT,
      externalCampaignId: '456789',
      status: 'enabled',
    })
    const mutateCall = calls.find((call) => call.method === 'googleAds.mutate')
    const body = mutateCall?.body as GoogleAdsMutateRequest | undefined
    const operation = body?.mutateOperations[0]?.campaignOperation as { update: { status: string } } | undefined

    expect(result).toMatchObject({ status: 'enabled', billingVerified: false, paymentMethodWarning: true })
    expect(operation?.update.status).toBe('ENABLED')
  })

  it('reads all campaign ad policy statuses and blocks while review is ongoing', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '1')
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS', USER_ID)
    const calls: GoogleAdsApiCall[] = []
    const requestAdsApi: GoogleAdsApiTransport = async (call) => {
      calls.push(call)
      return [{ results: [
        { adGroupAd: { policySummary: { approvalStatus: 'APPROVED', reviewStatus: 'REVIEWED' } } },
        { ad_group_ad: { policy_summary: { approval_status: 'APPROVED', review_status: 'REVIEW_IN_PROGRESS' } } },
      ] }]
    }
    const provider = createGoogleAdsProvider({ clientId: 'client-id', requestAdsApi })

    const result = await provider.getAdReviewStatus({
      customerId: '1234567890',
      loginCustomerId: '1111111111',
      campaignId: '456789',
      accessToken: 'access-token',
      context: PUBLISH_CONTEXT,
    })

    expect(result).toEqual({ status: 'review_in_progress', adCount: 2 })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.body && 'query' in calls[0].body ? calls[0].body.query : '')
      .toContain('ad_group_ad.policy_summary.approval_status')
    expect(calls[0]?.body && 'query' in calls[0].body ? calls[0].body.query : '')
      .toContain('campaign.id = 456789')
  })

  it('returns disapproved and unavailable review states without guessing approval', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '1')
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS', USER_ID)
    const payloads: unknown[] = [
      [{ results: [{ adGroupAd: { policySummary: { approvalStatus: 'DISAPPROVED', reviewStatus: 'REVIEWED' } } }] }],
      [{ results: [] }],
    ]
    const provider = createGoogleAdsProvider({
      clientId: 'client-id',
      requestAdsApi: async () => payloads.shift(),
    })

    const input = {
      customerId: '1234567890',
      loginCustomerId: null,
      campaignId: '456789',
      accessToken: 'access-token',
      context: PUBLISH_CONTEXT,
    }
    await expect(provider.getAdReviewStatus(input)).resolves.toEqual({ status: 'disapproved', adCount: 1 })
    await expect(provider.getAdReviewStatus(input)).resolves.toEqual({ status: 'unavailable', adCount: 0 })
  })

  it('never calls the Google transport for a user outside the publish allowlist', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '1')
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS', '660e8400-e29b-41d4-a716-446655440000')
    const requestAdsApi = vi.fn(async () => ({}))
    const provider = createGoogleAdsProvider({ clientId: 'client-id', requestAdsApi })

    await expect(provider.publishCampaign(publishInput() as AdsCampaignPublishInput))
      .rejects.toMatchObject({ code: 'publish_disabled' })
    expect(requestAdsApi).not.toHaveBeenCalled()
  })

  it('rejects API listing without a quota-bound user context', async () => {
    const provider = createGoogleAdsProvider({ clientId: 'client-id', requestAdsApi: async () => ({}) })
    await expect(provider.listAccounts('access-token')).rejects.toBeInstanceOf(GoogleAdsError)
  })
})
