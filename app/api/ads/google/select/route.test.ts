import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  requireGoogleAdsConnectUser: vi.fn(),
  createGoogleAdsProviderFromEnv: vi.fn(),
  decryptGoogleAdsOAuthFlowSecret: vi.fn(),
  retireGoogleAdsOAuthFlow: vi.fn(),
  encryptAdsToken: vi.fn(),
  loadAdsTokenKeyring: vi.fn(),
  revoke: vi.fn(),
  events: [] as string[],
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/ads/google-ads-route-auth', () => ({
  requireGoogleAdsConnectUser: mocks.requireGoogleAdsConnectUser,
}))
vi.mock('@/lib/ads/google-ads-oauth-server', () => ({
  createGoogleAdsProviderFromEnv: mocks.createGoogleAdsProviderFromEnv,
  decryptGoogleAdsOAuthFlowSecret: mocks.decryptGoogleAdsOAuthFlowSecret,
  retireGoogleAdsOAuthFlow: mocks.retireGoogleAdsOAuthFlow,
}))
vi.mock('@/lib/ads/token-crypto', () => ({
  encryptAdsToken: mocks.encryptAdsToken,
  loadAdsTokenKeyring: mocks.loadAdsTokenKeyring,
}))

import { POST } from '@/app/api/ads/google/select/route'

const USER_ID = 'b0b25d6f-55be-4fa8-97a4-53619a2a1284'
const FLOW_ID = 'edfa1338-5f86-4f9c-a9b4-38b686dd41e7'
const CONNECTION_ID = 'd9f4120b-4609-4ff4-a7da-5bb5b06f8a5c'
const ACCOUNT_ID = '2345678901'

function configureAdmin(upsertError: { message: string } | null = null) {
  const flowQuery: Record<string, any> = {}
  flowQuery.select = vi.fn(() => flowQuery)
  flowQuery.eq = vi.fn(() => flowQuery)
  flowQuery.gt = vi.fn(() => flowQuery)
  flowQuery.maybeSingle = vi.fn(async () => ({
    data: {
      id: FLOW_ID,
      user_id: USER_ID,
      pending_refresh_token_enc: 'encrypted-pending-token',
      account_candidates: [{
        externalAccountId: ACCOUNT_ID,
        name: 'Northwind Store',
        currency: 'TRY',
        loginCustomerId: '1234567890',
        isManager: false,
      }],
    },
    error: null,
  }))

  const connectionQuery: Record<string, any> = {}
  connectionQuery.upsert = vi.fn(() => {
    mocks.events.push('upsert')
    return connectionQuery
  })
  connectionQuery.select = vi.fn(() => connectionQuery)
  connectionQuery.single = vi.fn(async () => ({
    data: upsertError ? null : { id: CONNECTION_ID },
    error: upsertError,
  }))

  mocks.createAdminClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'ads_google_oauth_flows') return flowQuery
      if (table === 'ads_connections') return connectionQuery
      throw new Error(`Unexpected table: ${table}`)
    }),
  })

  return { connectionQuery }
}

function selectionRequest() {
  return new Request('https://app.example.com/api/ads/google/select', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ flowId: FLOW_ID, externalAccountId: ACCOUNT_ID }),
  })
}

describe('Google Ads OAuth account selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.events.length = 0
    mocks.requireGoogleAdsConnectUser.mockResolvedValue({ ok: true, userId: USER_ID })
    mocks.decryptGoogleAdsOAuthFlowSecret.mockReturnValue('pending-refresh-token')
    mocks.encryptAdsToken.mockReturnValue({ ciphertext: 'encrypted-connection-token', keyVersion: 1 })
    mocks.loadAdsTokenKeyring.mockReturnValue({})
    mocks.revoke.mockImplementation(async () => {
      mocks.events.push('revoke')
    })
    mocks.createGoogleAdsProviderFromEnv.mockReturnValue({ revoke: mocks.revoke })
    mocks.retireGoogleAdsOAuthFlow.mockImplementation(async () => {
      mocks.events.push('retire')
    })
    configureAdmin()
  })

  it('upserts the selected connection before retiring the OAuth flow', async () => {
    const response = await POST(selectionRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, connectionId: CONNECTION_ID })
    expect(mocks.events).toEqual(['upsert', 'retire'])
    expect(mocks.revoke).not.toHaveBeenCalled()
  })

  it('revokes the pending token and returns an error when the connection upsert fails', async () => {
    configureAdmin({ message: 'database unavailable' })

    const response = await POST(selectionRequest())

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: 'connection_failed' })
    expect(mocks.revoke).toHaveBeenCalledWith('pending-refresh-token')
    expect(mocks.events).toEqual(['upsert', 'revoke', 'retire'])
  })

  it('keeps the pending flow available for purge if revocation fails', async () => {
    configureAdmin({ message: 'database unavailable' })
    mocks.revoke.mockImplementationOnce(async () => {
      mocks.events.push('revoke')
      throw new Error('provider unavailable')
    })

    const response = await POST(selectionRequest())

    expect(response.status).toBe(502)
    expect(mocks.revoke).toHaveBeenCalledWith('pending-refresh-token')
    expect(mocks.retireGoogleAdsOAuthFlow).not.toHaveBeenCalled()
    expect(mocks.events).toEqual(['upsert', 'revoke'])
  })
})
