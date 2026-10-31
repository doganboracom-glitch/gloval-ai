// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  maybeSingleResults: [] as Array<{ data: unknown; error: unknown }>,
  commandResults: [] as Array<{ data: unknown; error: unknown }>,
  insertPayloads: [] as Array<Record<string, unknown>>,
  from: vi.fn(),
  saveConnection: vi.fn(),
  revoke: vi.fn(),
  decrypt: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.userId ? { id: mocks.userId } : null }, error: null }) },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock('@/lib/ads/token-crypto', () => ({
  loadAdsTokenKeyring: () => ({ activeVersion: 1, keys: new Map([[1, Buffer.alloc(32)]]) }),
  decryptAdsToken: mocks.decrypt,
}))
vi.mock('@/lib/ads/google-connections', () => ({
  saveGoogleAdsConnectionFromOAuth: mocks.saveConnection,
  googleOAuthTokenContext: (userId: string, flowId: string) => ({
    userId,
    platform: 'google_ads',
    externalAccountId: `oauth:${flowId}`,
  }),
}))
vi.mock('@/lib/ads/providers/google-ads-provider', () => ({
  GOOGLE_ADS_SCOPE: 'https://www.googleapis.com/auth/adwords',
  revokeGoogleAdsRefreshToken: mocks.revoke,
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }))

import { POST } from './route'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const FLOW_ID = '987e6543-e21b-42d3-a456-426614174000'
const ACCOUNT_ID = '9876543210'
const ENCRYPTED_TOKEN = 'encrypted-pending-refresh-token'

const FLOW_ROW = {
  id: FLOW_ID,
  user_id: USER_ID,
  state_hash: 'a'.repeat(64),
  code_verifier_enc: null,
  pending_refresh_token_enc: ENCRYPTED_TOKEN,
  status: 'awaiting_account',
  account_candidates: [{
    externalAccountId: ACCOUNT_ID,
    name: 'Test account',
    currency: 'TRY',
    isManager: false,
    loginCustomerId: null,
  }],
  scopes: ['https://www.googleapis.com/auth/adwords'],
  state_consumed_at: '2026-10-31T00:00:00.000Z',
  expires_at: '2099-01-01T00:00:00.000Z',
  created_at: '2026-10-30T23:45:00.000Z',
}

function queryBuilder() {
  let operation: 'select' | 'delete' | 'insert' = 'select'
  const builder: Record<string, any> = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.gt = () => builder
  builder.delete = () => {
    operation = 'delete'
    return builder
  }
  builder.insert = (payload: Record<string, unknown>) => {
    operation = 'insert'
    mocks.insertPayloads.push(payload)
    return builder
  }
  builder.maybeSingle = async () => mocks.maybeSingleResults.shift() ?? { data: null, error: null }
  builder.then = (resolve: (result: unknown) => unknown) => {
    const result = operation === 'insert'
      ? mocks.commandResults.shift() ?? { data: null, error: null }
      : { data: null, error: null }
    return Promise.resolve(result).then(resolve)
  }
  return builder
}

function request(userId: string | null = USER_ID) {
  mocks.userId = userId
  return new Request('https://gloval.ai/api/ads/google/select', {
    method: 'POST',
    headers: { origin: 'https://gloval.ai', 'content-type': 'application/json' },
    body: JSON.stringify({ flowId: FLOW_ID, accountId: ACCOUNT_ID }),
  })
}

function setupFlow() {
  mocks.maybeSingleResults = [
    { data: FLOW_ROW, error: null },
    { data: FLOW_ROW, error: null },
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
  vi.stubEnv('ADS_GOOGLE_CONNECT_ENABLED', '1')
  vi.stubEnv('ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS', USER_ID)
  mocks.userId = USER_ID
  mocks.maybeSingleResults = []
  mocks.commandResults = []
  mocks.insertPayloads = []
  mocks.from.mockImplementation(() => queryBuilder())
  mocks.decrypt.mockReturnValue('refresh-token-plaintext')
  mocks.revoke.mockResolvedValue(undefined)
  mocks.saveConnection.mockResolvedValue({ id: 'connection-id' })
})

afterEach(() => vi.unstubAllEnvs())

describe('POST /api/ads/google/select', () => {
  it('returns 401 for an unauthenticated caller without reading flow data', async () => {
    const response = await POST(request(null))

    expect(response.status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.saveConnection).not.toHaveBeenCalled()
  })

  it('returns 404 for an authenticated user outside the allowlist', async () => {
    vi.stubEnv('ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS', OTHER_USER_ID)
    const response = await POST(request())

    expect(response.status).toBe(404)
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.saveConnection).not.toHaveBeenCalled()
  })

  it('saves the selected account and consumes the flow once', async () => {
    setupFlow()
    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, connectionId: 'connection-id' })
    expect(mocks.saveConnection).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      refreshToken: 'refresh-token-plaintext',
      scopes: FLOW_ROW.scopes,
    }))
    expect(mocks.revoke).not.toHaveBeenCalled()
    expect(mocks.insertPayloads).toHaveLength(0)
  })

  it('revokes the token and restores a non-selectable flow if the connection upsert fails', async () => {
    setupFlow()
    mocks.saveConnection.mockRejectedValueOnce(new GoogleAdsError('provider_error'))
    const response = await POST(request())

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ ok: false, error: 'provider_error' })
    expect(mocks.revoke).toHaveBeenCalledWith('refresh-token-plaintext')
    expect(mocks.insertPayloads).toHaveLength(1)
    expect(mocks.insertPayloads[0]).toMatchObject({
      id: FLOW_ID,
      user_id: USER_ID,
      status: 'awaiting_account',
      pending_refresh_token_enc: ENCRYPTED_TOKEN,
      account_candidates: [],
    })
  })

  it('preserves selectable candidates for retry when revocation itself fails', async () => {
    setupFlow()
    mocks.saveConnection.mockRejectedValueOnce(new GoogleAdsError('provider_error'))
    mocks.revoke.mockRejectedValueOnce(new GoogleAdsError('disconnect_failed'))
    const response = await POST(request())

    expect(response.status).toBe(502)
    expect(mocks.revoke).toHaveBeenCalledWith('refresh-token-plaintext')
    expect(mocks.insertPayloads[0]?.account_candidates).toEqual(FLOW_ROW.account_candidates)
  })
})
