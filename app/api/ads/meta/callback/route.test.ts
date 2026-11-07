// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { createMetaOAuthState } from '@/lib/ads/meta-oauth-state'

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  cookieValue: '',
  maybeSingleResults: [] as Array<{ data: unknown; error: unknown }>,
  updates: [] as Array<Record<string, unknown>>,
  deleteCalls: 0,
  from: vi.fn(),
  exchange: vi.fn(),
  inspect: vi.fn(),
  listAccounts: vi.fn(),
  listPages: vi.fn(),
  revoke: vi.fn(),
  loginMode: 'scope' as 'scope' | 'config_id',
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: mocks.cookieValue }) }),
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
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock('@/lib/ads/token-crypto', () => ({
  loadAdsTokenKeyring: () => ({ activeVersion: 1, keys: new Map([[1, Buffer.alloc(32)]]) }),
  encryptAdsToken: () => ({ ciphertext: 'encrypted-pending-token', keyVersion: 1 }),
}))
vi.mock('@/lib/ads/meta-provider-factory', () => ({
  createConfiguredMetaProvider: () => ({
    ok: true,
    stateSecret: 'test-state-secret-with-at-least-thirty-two-characters',
    apiVersion: 'v24.0',
    loginMode: mocks.loginMode,
    provider: {
      exchangeCodeForLongLivedToken: mocks.exchange,
      inspectToken: mocks.inspect,
      listAdAccounts: mocks.listAccounts,
      listPages: mocks.listPages,
      revokePermissions: mocks.revoke,
    },
  }),
}))

import { GET } from './route'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const FLOW_ID = '987e6543-e21b-42d3-a456-426614174000'
const STATE_SECRET = 'test-state-secret-with-at-least-thirty-two-characters'
const ALL_SCOPES = ['ads_read', 'business_management', 'pages_show_list', 'pages_read_engagement']

function queryBuilder() {
  const builder: Record<string, any> = {}
  builder.update = (patch: Record<string, unknown>) => {
    mocks.updates.push(patch)
    return builder
  }
  builder.delete = () => {
    mocks.deleteCalls += 1
    return builder
  }
  builder.eq = () => builder
  builder.gt = () => builder
  builder.select = () => builder
  builder.maybeSingle = async () => mocks.maybeSingleResults.shift() ?? { data: null, error: null }
  builder.then = (resolve: (result: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve)
  return builder
}

function callbackRequest(options: { error?: string; code?: string; state?: string; userId?: string } = {}) {
  const created = options.state
    ? null
    : createMetaOAuthState({ userId: options.userId ?? USER_ID, flowId: FLOW_ID, secret: STATE_SECRET })
  const state = options.state ?? created!.state
  if (created) mocks.cookieValue = created.nonce
  const url = new URL('https://gloval.ai/api/ads/meta/callback')
  url.searchParams.set('state', state)
  if (options.code) url.searchParams.set('code', options.code)
  if (options.error) url.searchParams.set('error', options.error)
  return new Request(url)
}

function redirectParams(response: Response) {
  return new URL(response.headers.get('location') ?? 'https://gloval.ai').searchParams
}

function flowFound() {
  // 1st maybeSingle: the started-flow lookup, 2nd: the awaiting_account save.
  mocks.maybeSingleResults = [
    { data: { id: FLOW_ID }, error: null },
    { data: { id: FLOW_ID }, error: null },
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
  vi.stubEnv('ADS_FEATURE_UI', '1')
  vi.stubEnv('META_ADS_ACCESS_MODE', 'allowlist')
  vi.stubEnv('META_ADS_ALLOWED_USER_IDS', USER_ID)
  vi.stubEnv('META_ADS_KILL_SWITCH', '')
  mocks.userId = USER_ID
  mocks.cookieValue = ''
  mocks.maybeSingleResults = []
  mocks.updates = []
  mocks.deleteCalls = 0
  mocks.loginMode = 'scope'
  mocks.from.mockImplementation(() => queryBuilder())
  mocks.exchange.mockResolvedValue({ accessToken: 'long-lived-token', expiresAt: '2026-09-01T00:00:00.000Z' })
  mocks.inspect.mockResolvedValue({ isValid: true, scopes: ALL_SCOPES, metaUserId: '1234567890', expiresAt: '2026-09-01T00:00:00.000Z' })
  mocks.listAccounts.mockResolvedValue([
    { externalAccountId: 'act_123456789', name: 'Test account', currency: 'TRY', accountStatus: 1, businessId: '777' },
  ])
  mocks.listPages.mockResolvedValue([{ pageId: '555', pageName: 'Test page' }])
  mocks.revoke.mockResolvedValue(undefined)
})

afterEach(() => vi.unstubAllEnvs())

describe('GET /api/ads/meta/callback', () => {
  it('stores the encrypted token and redirects to the account picker on the happy path', async () => {
    flowFound()
    const response = await GET(callbackRequest({ code: 'oauth-code' }))

    expect(redirectParams(response).get('meta_flow')).toBe(FLOW_ID)
    expect(mocks.revoke).not.toHaveBeenCalled()
    expect(mocks.updates).toHaveLength(1)
    expect(mocks.updates[0]).toMatchObject({
      status: 'awaiting_account',
      pending_token_enc: 'encrypted-pending-token',
      pending_meta_user_id: '1234567890',
      granted_scopes: ALL_SCOPES,
    })
    expect(JSON.stringify(mocks.updates[0])).not.toContain('long-lived-token')
  })

  it('treats access_denied as a user cancellation without exchanging a code', async () => {
    flowFound()
    const response = await GET(callbackRequest({ error: 'access_denied' }))

    expect(redirectParams(response).get('meta')).toBe('oauth_denied')
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.deleteCalls).toBe(1)
  })

  it('revokes the grant and reports the missing required scopes', async () => {
    flowFound()
    mocks.inspect.mockResolvedValue({ isValid: true, scopes: ['ads_read'], metaUserId: '1234567890', expiresAt: null })
    const response = await GET(callbackRequest({ code: 'oauth-code' }))

    const params = redirectParams(response)
    expect(params.get('meta')).toBe('permission_missing')
    expect(params.get('meta_missing')).toBe('business_management,pages_show_list')
    expect(mocks.revoke).toHaveBeenCalledTimes(1)
    expect(mocks.deleteCalls).toBe(1)
    expect(mocks.updates).toHaveLength(0)
  })

  it('blames the Meta app Configuration when permissions are missing in config_id mode', async () => {
    flowFound()
    mocks.loginMode = 'config_id'
    mocks.inspect.mockResolvedValue({ isValid: true, scopes: ['ads_read'], metaUserId: '1234567890', expiresAt: null })
    const response = await GET(callbackRequest({ code: 'oauth-code' }))

    const params = redirectParams(response)
    expect(params.get('meta')).toBe('config_permission_missing')
    expect(params.get('meta_missing')).toBeNull()
    expect(mocks.revoke).toHaveBeenCalledTimes(1)
  })

  it('still connects when listing Pages fails (Pages are optional context)', async () => {
    flowFound()
    mocks.listPages.mockRejectedValue(new MetaAdsError('provider_error'))
    const response = await GET(callbackRequest({ code: 'oauth-code' }))

    expect(redirectParams(response).get('meta_flow')).toBe(FLOW_ID)
    expect(mocks.updates[0]).toMatchObject({ page_candidates: [] })
  })

  it('revokes the grant when the user has no ad accounts', async () => {
    flowFound()
    mocks.listAccounts.mockResolvedValue([])
    const response = await GET(callbackRequest({ code: 'oauth-code' }))

    expect(redirectParams(response).get('meta')).toBe('no_accounts')
    expect(mocks.revoke).toHaveBeenCalledTimes(1)
    expect(mocks.deleteCalls).toBe(1)
  })

  it('rejects a state whose nonce cookie does not match before calling Meta', async () => {
    flowFound()
    const request = callbackRequest({ code: 'oauth-code' })
    mocks.cookieValue = 'a'.repeat(43)
    const response = await GET(request)

    expect(redirectParams(response).get('meta')).toBe('state_invalid')
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it('rejects a state minted for a different user', async () => {
    flowFound()
    const response = await GET(callbackRequest({ code: 'oauth-code', userId: OTHER_USER_ID }))

    expect(redirectParams(response).get('meta')).toBe('state_invalid')
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it('rejects an expired state', async () => {
    flowFound()
    const expired = createMetaOAuthState({ userId: USER_ID, flowId: FLOW_ID, secret: STATE_SECRET, now: Date.now() - 16 * 60_000 })
    mocks.cookieValue = expired.nonce
    const response = await GET(callbackRequest({ state: expired.state, code: 'oauth-code' }))

    expect(redirectParams(response).get('meta')).toBe('state_invalid')
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it('fails closed with kill_switch_active and drops the flow', async () => {
    flowFound()
    vi.stubEnv('META_ADS_KILL_SWITCH', '1')
    const response = await GET(callbackRequest({ code: 'oauth-code' }))

    expect(redirectParams(response).get('meta')).toBe('kill_switch_active')
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.deleteCalls).toBe(1)
  })

  it('hides the route from users outside the allowlist', async () => {
    flowFound()
    mocks.userId = OTHER_USER_ID
    const response = await GET(callbackRequest({ code: 'oauth-code', userId: OTHER_USER_ID }))

    expect(redirectParams(response).get('meta')).toBe('not_found')
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it('redirects anonymous callers to login', async () => {
    mocks.userId = null
    const response = await GET(callbackRequest({ code: 'oauth-code' }))

    expect(response.headers.get('location')).toContain('/auth/login')
    expect(mocks.exchange).not.toHaveBeenCalled()
  })
})
