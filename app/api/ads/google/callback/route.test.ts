// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import { createGoogleOAuthState } from '@/lib/ads/google-oauth-state'

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  cookieValue: '',
  updateResults: [] as Array<{ data: unknown; error: unknown }>,
  commandResults: [] as Array<{ data: unknown; error: unknown }>,
  updates: [] as Array<Record<string, unknown>>,
  from: vi.fn(),
  exchange: vi.fn(),
  listAccounts: vi.fn(),
  revoke: vi.fn(),
  deleteCalls: 0,
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: mocks.cookieValue }) }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.userId ? { id: mocks.userId } : null }, error: null }) },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock('@/lib/ads/token-crypto', () => ({
  loadAdsTokenKeyring: () => ({ activeVersion: 1, keys: new Map([[1, Buffer.alloc(32)]]) }),
  decryptAdsToken: () => 'pkce-verifier',
  encryptAdsToken: () => ({ ciphertext: 'encrypted-pending-token', keyVersion: 1 }),
}))
vi.mock('@/lib/ads/providers/google-ads-provider', () => ({
  createGoogleAdsProvider: () => ({
    exchangeCodeWithVerifier: mocks.exchange,
    listAccountsForUser: mocks.listAccounts,
  }),
  revokeGoogleAdsRefreshToken: mocks.revoke,
}))
vi.mock('@/lib/ads/google-api-client', () => ({ createGoogleAdsApiTransport: () => vi.fn() }))

import { GET } from './route'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const FLOW_ID = '987e6543-e21b-42d3-a456-426614174000'
const STATE_SECRET = 'test-state-secret-with-at-least-thirty-two-characters'

function queryBuilder() {
  let operation: 'update' | 'delete' | null = null
  const builder: Record<string, any> = {}
  builder.update = (patch: Record<string, unknown>) => {
    operation = 'update'
    mocks.updates.push(patch)
    return builder
  }
  builder.delete = () => {
    operation = 'delete'
    mocks.deleteCalls += 1
    return builder
  }
  builder.eq = () => builder
  builder.gt = () => builder
  builder.select = () => builder
  builder.maybeSingle = async () => mocks.updateResults.shift() ?? { data: null, error: null }
  builder.then = (resolve: (result: unknown) => unknown) => {
    const result = operation === 'delete'
      ? mocks.commandResults.shift() ?? { data: null, error: null }
      : { data: null, error: null }
    return Promise.resolve(result).then(resolve)
  }
  return builder
}

function callbackRequest(options: { error?: string; code?: string; state?: string } = {}) {
  const created = options.state
    ? null
    : createGoogleOAuthState({ userId: USER_ID, flowId: FLOW_ID, secret: STATE_SECRET })
  const state = options.state ?? created!.state
  if (created) mocks.cookieValue = created.nonce
  const url = new URL('https://gloval.ai/api/ads/google/callback')
  url.searchParams.set('state', state)
  if (options.code) url.searchParams.set('code', options.code)
  if (options.error) url.searchParams.set('error', options.error)
  return new Request(url)
}

function redirectCode(response: Response): string | null {
  return new URL(response.headers.get('location') ?? 'https://gloval.ai').searchParams.get('google')
}

function setFlowConsumeResult() {
  mocks.updateResults = [{ data: { id: FLOW_ID, code_verifier_enc: 'encrypted-verifier' }, error: null }]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
  vi.stubEnv('ADS_GOOGLE_CONNECT_ENABLED', '1')
  vi.stubEnv('ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS', USER_ID)
  vi.stubEnv('ADS_OAUTH_STATE_SECRET', STATE_SECRET)
  vi.stubEnv('GOOGLE_ADS_OAUTH_CLIENT_ID', 'client-id')
  vi.stubEnv('GOOGLE_ADS_OAUTH_CLIENT_SECRET', 'client-secret')
  vi.stubEnv('GOOGLE_ADS_OAUTH_REDIRECT_URI', 'https://gloval.ai/api/ads/google/callback')
  mocks.userId = USER_ID
  mocks.cookieValue = createGoogleOAuthState({ userId: USER_ID, flowId: FLOW_ID, secret: STATE_SECRET }).nonce
  mocks.updateResults = []
  mocks.commandResults = []
  mocks.updates = []
  mocks.deleteCalls = 0
  mocks.from.mockImplementation(() => queryBuilder())
  mocks.exchange.mockResolvedValue({
    accessToken: 'short-lived-access-token',
    refreshToken: 'refresh-token',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    scopes: ['https://www.googleapis.com/auth/adwords'],
  })
  mocks.listAccounts.mockResolvedValue([{
    externalAccountId: '9876543210',
    name: 'Test account',
    currency: 'TRY',
    isManager: false,
    loginCustomerId: null,
  }])
  mocks.revoke.mockResolvedValue(undefined)
})

afterEach(() => vi.unstubAllEnvs())

describe('GET /api/ads/google/callback', () => {
  it('handles access_denied as user cancellation without exchanging a token', async () => {
    setFlowConsumeResult()
    const response = await GET(callbackRequest({ error: 'access_denied' }))

    expect(redirectCode(response)).toBe('oauth_denied')
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.deleteCalls).toBe(1)
  })

  it('rejects expired state before touching the flow or calling Google', async () => {
    const expired = createGoogleOAuthState({
      userId: USER_ID,
      flowId: FLOW_ID,
      secret: STATE_SECRET,
      now: Date.now() - 16 * 60_000,
    })
    const response = await GET(callbackRequest({ state: expired.state, code: 'oauth-code' }))

    expect(redirectCode(response)).toBe('state_invalid')
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it('rejects replay when the flow is no longer in the started state', async () => {
    mocks.updateResults = [{ data: null, error: null }]
    const response = await GET(callbackRequest({ code: 'oauth-code' }))

    expect(redirectCode(response)).toBe('state_invalid')
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it('rejects a nonce cookie mismatch before consuming the flow', async () => {
    const request = callbackRequest({ code: 'oauth-code' })
    mocks.cookieValue = 'different-browser-nonce'
    const response = await GET(request)

    expect(redirectCode(response)).toBe('state_invalid')
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it('does not exchange a code for a user outside the allowlist', async () => {
    vi.stubEnv('ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS', OTHER_USER_ID)
    setFlowConsumeResult()
    const response = await GET(callbackRequest({ code: 'oauth-code' }))

    expect(redirectCode(response)).toBe('not_found')
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.deleteCalls).toBe(1)
  })

  it('redirects unauthenticated callbacks to login without exchanging the code', async () => {
    mocks.userId = null
    const response = await GET(callbackRequest({ code: 'oauth-code' }))

    expect(new URL(response.headers.get('location') ?? 'https://gloval.ai').pathname).toBe('/auth/login')
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it('cleans up the flow when token exchange fails', async () => {
    setFlowConsumeResult()
    mocks.exchange.mockRejectedValueOnce(new GoogleAdsError('oauth_failed'))
    const response = await GET(callbackRequest({ code: 'oauth-code' }))

    expect(redirectCode(response)).toBe('oauth_failed')
    expect(mocks.revoke).not.toHaveBeenCalled()
    expect(mocks.deleteCalls).toBe(1)
  })

  it('cleans up a flow when Google returns no refresh token', async () => {
    setFlowConsumeResult()
    mocks.exchange.mockRejectedValueOnce(new GoogleAdsError('refresh_token_missing'))
    const response = await GET(callbackRequest({ code: 'oauth-code' }))

    expect(redirectCode(response)).toBe('refresh_token_missing')
    expect(mocks.revoke).not.toHaveBeenCalled()
    expect(mocks.deleteCalls).toBe(1)
  })

  it('revokes the exchanged token if account listing fails', async () => {
    setFlowConsumeResult()
    mocks.listAccounts.mockRejectedValueOnce(new GoogleAdsError('account_list_failed'))
    const response = await GET(callbackRequest({ code: 'oauth-code' }))

    expect(redirectCode(response)).toBe('account_list_failed')
    expect(mocks.revoke).toHaveBeenCalledWith('refresh-token')
    expect(mocks.deleteCalls).toBe(1)
  })

  it('stores an encrypted, non-selectable cleanup flow when revocation fails', async () => {
    setFlowConsumeResult()
    mocks.listAccounts.mockRejectedValueOnce(new GoogleAdsError('account_list_failed'))
    mocks.revoke.mockRejectedValueOnce(new GoogleAdsError('disconnect_failed'))
    mocks.updateResults.push({ data: { id: FLOW_ID }, error: null })
    const response = await GET(callbackRequest({ code: 'oauth-code' }))

    expect(redirectCode(response)).toBe('account_list_failed')
    expect(mocks.updates.at(-1)).toMatchObject({
      status: 'awaiting_account',
      code_verifier_enc: null,
      pending_refresh_token_enc: 'encrypted-pending-token',
      account_candidates: [],
    })
    expect(mocks.deleteCalls).toBe(0)
  })
})
