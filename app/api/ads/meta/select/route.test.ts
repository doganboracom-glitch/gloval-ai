// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  selectResults: [] as Array<{ data: unknown; error: unknown }>,
  deleteResults: [] as Array<{ data: unknown; error: unknown }>,
  inserted: [] as unknown[],
  from: vi.fn(),
  save: vi.fn(),
  instagram: vi.fn(),
  decrypt: vi.fn(),
  logEvent: vi.fn(),
  rateAllowed: true,
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
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: mocks.rateAllowed }) }))
vi.mock('@/lib/notify', () => ({ logUserEvent: (...args: unknown[]) => mocks.logEvent(...args) }))
vi.mock('@/lib/ads/token-crypto', () => ({
  loadAdsTokenKeyring: () => ({ activeVersion: 1, keys: new Map([[1, Buffer.alloc(32)]]) }),
  decryptAdsToken: (...args: unknown[]) => mocks.decrypt(...args),
}))
vi.mock('@/lib/ads/meta-connections', () => ({
  saveMetaConnectionFromOAuth: (...args: unknown[]) => mocks.save(...args),
}))
vi.mock('@/lib/ads/meta-provider-factory', () => ({
  createConfiguredMetaProvider: () => ({
    ok: true,
    stateSecret: 'x'.repeat(32),
    apiVersion: 'v24.0',
    loginMode: 'scope',
    provider: { listInstagramAccounts: mocks.instagram },
  }),
}))

import { GET, POST } from './route'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const FLOW_ID = '987e6543-e21b-42d3-a456-426614174000'
const ACCOUNT_ID = 'act_123456789'

const flowRow = {
  id: FLOW_ID,
  pending_token_enc: 'encrypted-pending-token',
  pending_token_expires_at: '2026-09-01T00:00:00.000Z',
  pending_meta_user_id: '1234567890',
  granted_scopes: ['ads_read', 'business_management', 'pages_show_list'],
  account_candidates: [
    { externalAccountId: ACCOUNT_ID, name: 'Test account', currency: 'TRY', accountStatus: 1, businessId: '777' },
    { externalAccountId: 'not-an-account', name: 'Bad row' },
  ],
  page_candidates: [{ pageId: '555', pageName: 'Test page' }, { pageId: 'bad', pageName: 'Bad page' }],
}

function queryBuilder() {
  let operation: 'select' | 'delete' | 'insert' = 'select'
  const builder: Record<string, any> = {}
  builder.select = () => builder
  builder.delete = () => {
    operation = 'delete'
    return builder
  }
  builder.insert = async (row: unknown) => {
    mocks.inserted.push(row)
    return { error: null }
  }
  builder.eq = () => builder
  builder.gt = () => builder
  builder.maybeSingle = async () =>
    (operation === 'delete' ? mocks.deleteResults.shift() : mocks.selectResults.shift()) ?? { data: null, error: null }
  return builder
}

function postRequest(body: unknown, headers: Record<string, string> = { origin: 'https://gloval.ai' }) {
  return new Request('https://gloval.ai/api/ads/meta/select', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
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
  mocks.selectResults = [{ data: flowRow, error: null }]
  mocks.deleteResults = [{ data: flowRow, error: null }]
  mocks.inserted = []
  mocks.rateAllowed = true
  mocks.from.mockImplementation(() => queryBuilder())
  mocks.decrypt.mockReturnValue('long-lived-token')
  mocks.instagram.mockResolvedValue([{ id: '17841400000000000', username: 'test_ig' }])
  mocks.save.mockResolvedValue({ id: 'conn-1' })
  mocks.logEvent.mockResolvedValue(undefined)
})

afterEach(() => vi.unstubAllEnvs())

describe('GET /api/ads/meta/select', () => {
  it('returns only well-formed account and page candidates', async () => {
    const response = await GET(new Request(`https://gloval.ai/api/ads/meta/select?flowId=${FLOW_ID}`))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.accounts).toHaveLength(1)
    expect(body.accounts[0].externalAccountId).toBe(ACCOUNT_ID)
    expect(body.pages).toEqual([{ pageId: '555', pageName: 'Test page' }])
    expect(JSON.stringify(body)).not.toContain('encrypted-pending-token')
  })

  it('answers 404 flow_expired when the flow is gone', async () => {
    mocks.selectResults = [{ data: null, error: null }]
    const response = await GET(new Request(`https://gloval.ai/api/ads/meta/select?flowId=${FLOW_ID}`))
    expect(response.status).toBe(404)
    expect((await response.json()).error).toBe('flow_expired')
  })

  it('rejects a malformed flow id', async () => {
    const response = await GET(new Request('https://gloval.ai/api/ads/meta/select?flowId=nope'))
    expect(response.status).toBe(400)
  })
})

describe('POST /api/ads/meta/select', () => {
  it('saves the chosen account, Page and Instagram account', async () => {
    const response = await POST(postRequest({ flowId: FLOW_ID, accountId: ACCOUNT_ID, pageId: '555' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, connectionId: 'conn-1' })
    expect(mocks.save).toHaveBeenCalledTimes(1)
    const saved = mocks.save.mock.calls[0][0]
    expect(saved.userId).toBe(USER_ID)
    expect(saved.account.externalAccountId).toBe(ACCOUNT_ID)
    expect(saved.page).toEqual({ pageId: '555', pageName: 'Test page' })
    expect(saved.instagram).toEqual({ id: '17841400000000000', username: 'test_ig' })
    expect(saved.accessToken).toBe('long-lived-token')
    expect(mocks.logEvent).toHaveBeenCalledTimes(1)
  })

  it('still saves when the Instagram lookup fails', async () => {
    mocks.instagram.mockRejectedValue(new MetaAdsError('provider_error'))
    const response = await POST(postRequest({ flowId: FLOW_ID, accountId: ACCOUNT_ID }))

    expect(response.status).toBe(200)
    expect(mocks.save.mock.calls[0][0].instagram).toBeNull()
  })

  it('rejects cross-origin posts', async () => {
    const response = await POST(postRequest({ flowId: FLOW_ID, accountId: ACCOUNT_ID }, { origin: 'https://evil.example' }))
    expect(response.status).toBe(403)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('rejects posts without an origin header', async () => {
    const response = await POST(postRequest({ flowId: FLOW_ID, accountId: ACCOUNT_ID }, {}))
    expect(response.status).toBe(403)
  })

  it('requires a signed-in user', async () => {
    mocks.userId = null
    const response = await POST(postRequest({ flowId: FLOW_ID, accountId: ACCOUNT_ID }))
    expect(response.status).toBe(401)
  })

  it('hides the route from users outside the allowlist', async () => {
    mocks.userId = OTHER_USER_ID
    const response = await POST(postRequest({ flowId: FLOW_ID, accountId: ACCOUNT_ID }))
    expect(response.status).toBe(404)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('blocks new connections while the kill switch is on', async () => {
    vi.stubEnv('META_ADS_KILL_SWITCH', '1')
    const response = await POST(postRequest({ flowId: FLOW_ID, accountId: ACCOUNT_ID }))
    expect(response.status).toBe(503)
    expect((await response.json()).error).toBe('kill_switch_active')
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('rate limits per user', async () => {
    mocks.rateAllowed = false
    const response = await POST(postRequest({ flowId: FLOW_ID, accountId: ACCOUNT_ID }))
    expect(response.status).toBe(429)
  })

  it('rejects invalid ids before touching the database', async () => {
    for (const body of [
      { flowId: 'nope', accountId: ACCOUNT_ID },
      { flowId: FLOW_ID, accountId: '123456789' },
      { flowId: FLOW_ID, accountId: ACCOUNT_ID, pageId: 'abc' },
    ]) {
      const response = await POST(postRequest(body))
      expect(response.status).toBe(400)
    }
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('rejects an account that was not one of the flow candidates', async () => {
    const response = await POST(postRequest({ flowId: FLOW_ID, accountId: 'act_999999999' }))
    expect(response.status).toBe(404)
    expect((await response.json()).error).toBe('account_not_found')
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('rejects a Page that was not one of the flow candidates', async () => {
    const response = await POST(postRequest({ flowId: FLOW_ID, accountId: ACCOUNT_ID, pageId: '999' }))
    expect(response.status).toBe(400)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('does not save twice when the flow was already consumed', async () => {
    mocks.deleteResults = [{ data: null, error: null }]
    const response = await POST(postRequest({ flowId: FLOW_ID, accountId: ACCOUNT_ID }))
    expect(response.status).toBe(404)
    expect((await response.json()).error).toBe('flow_expired')
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('restores the flow so the user can retry after a save failure', async () => {
    mocks.save.mockRejectedValue(new MetaAdsError('connection_limit_exceeded'))
    const response = await POST(postRequest({ flowId: FLOW_ID, accountId: ACCOUNT_ID }))

    expect(response.status).toBe(429)
    expect((await response.json()).error).toBe('connection_limit_exceeded')
    expect(mocks.inserted).toEqual([flowRow])
  })
})
