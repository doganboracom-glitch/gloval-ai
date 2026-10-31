import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import type { GoogleAdsProvider } from '@/lib/ads/providers/types'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  loadKeyring: vi.fn(),
  decrypt: vi.fn(),
  encrypt: vi.fn(),
  needsRotation: vi.fn(),
  updates: [] as Array<Record<string, unknown>>,
  connection: null as Record<string, unknown> | null,
  claimAllowed: true,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}))
vi.mock('@/lib/ads/token-crypto', () => ({
  adsTokenNeedsRotation: mocks.needsRotation,
  decryptAdsToken: mocks.decrypt,
  encryptAdsToken: mocks.encrypt,
  loadAdsTokenKeyring: mocks.loadKeyring,
}))
vi.mock('@/lib/ads/providers/google-ads-provider', () => ({
  revokeGoogleAdsRefreshToken: vi.fn(),
}))

import { withGoogleAdsAccess } from '@/lib/ads/google-connections'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const CONNECTION_ID = '123e4567-e89b-42d3-a456-426614174000'

function makeAdminQuery() {
  let isUpdate = false
  const builder: Record<string, unknown> & {
    select: (...args: unknown[]) => typeof builder
    update: (patch: Record<string, unknown>) => typeof builder
    eq: (...args: unknown[]) => typeof builder
    in: (...args: unknown[]) => typeof builder
    or: (...args: unknown[]) => typeof builder
    maybeSingle: () => Promise<{ data: unknown; error: null }>
    then: (resolve: (value: { error: null }) => unknown) => Promise<unknown>
  } = {
    select: () => builder,
    update: (patch) => {
      isUpdate = true
      mocks.updates.push(patch)
      return builder
    },
    eq: () => builder,
    in: () => builder,
    or: () => builder,
    maybeSingle: async () => isUpdate
      ? { data: mocks.claimAllowed ? { id: CONNECTION_ID } : null, error: null }
      : { data: mocks.connection ? { ...mocks.connection } : null, error: null },
    then: (resolve) => Promise.resolve({ error: null }).then(resolve),
  }
  return builder
}

function provider(refresh: GoogleAdsProvider['refreshAccessTokenWithRotation']): GoogleAdsProvider {
  return {
    platform: 'google_ads',
    status: 'available',
    displayName: 'Google Ads',
    buildAuthUrl: () => '',
    exchangeCode: async () => ({ accessToken: '', refreshToken: '', expiresAt: null, scopes: [] }),
    exchangeCodeWithVerifier: async () => ({ accessToken: '', refreshToken: '', expiresAt: null, scopes: [] }),
    refreshAccessToken: async () => ({ accessToken: '', expiresAt: null }),
    refreshAccessTokenWithRotation: refresh,
    listAccounts: async () => [],
    listAccountsForUser: async () => [],
    getPerformance: async () => ({
      range: '7d',
      currency: null,
      totals: { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 },
      campaigns: [],
    }),
    publishCampaign: async () => ({ externalCampaignId: '', status: 'paused' }),
    setCampaignStatus: async () => {},
    revoke: async () => {},
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates.length = 0
  mocks.claimAllowed = true
  mocks.connection = {
    id: CONNECTION_ID,
    user_id: USER_ID,
    platform: 'google_ads',
    external_account_id: '9876543210',
    external_account_name: 'Test account',
    login_customer_id: null,
    currency_code: 'TRY',
    is_manager: false,
    refresh_token_enc: 'encrypted-refresh-token',
    token_key_version: 1,
    scopes: ['https://www.googleapis.com/auth/adwords'],
    status: 'active',
    last_error: null,
    api_lease_id: null,
    api_lease_expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  mocks.loadKeyring.mockReturnValue({ activeVersion: 1, keys: new Map([[1, Buffer.alloc(32)]]) })
  mocks.decrypt.mockReturnValue('refresh-token-plaintext')
  mocks.encrypt.mockReturnValue({ ciphertext: 'encrypted-rotated-token', keyVersion: 1 })
  mocks.needsRotation.mockReturnValue(false)
  mocks.from.mockImplementation(() => makeAdminQuery())
})

describe('Google Ads connection lifecycle', () => {
  it('serializes refresh and reporting with a lease and releases it afterward', async () => {
    const refresh = vi.fn(async () => ({
      accessToken: 'short-lived-access-token',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      refreshToken: null,
    }))
    const action = vi.fn(async ({ connection, accessToken, context }) => ({
      accountId: connection.external_account_id,
      accessToken,
      context,
    }))

    const result = await withGoogleAdsAccess({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      provider: provider(refresh),
      action,
    })

    expect(refresh).toHaveBeenCalledWith('refresh-token-plaintext')
    expect(action).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'short-lived-access-token',
      context: { userId: USER_ID, connectionId: CONNECTION_ID },
    }))
    expect(result).toMatchObject({ accountId: '9876543210', accessToken: 'short-lived-access-token' })
    expect(mocks.updates[0]).toMatchObject({ api_lease_id: expect.any(String), api_lease_expires_at: expect.any(String) })
    expect(mocks.updates.at(-1)).toEqual({ api_lease_id: null, api_lease_expires_at: null })
  })

  it('clears a refresh token on invalid_grant but still releases the lease', async () => {
    const refresh = vi.fn(async () => {
      throw new GoogleAdsError('reauth_required')
    })
    const action = vi.fn()

    await expect(withGoogleAdsAccess({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      provider: provider(refresh),
      action: async () => null,
    })).rejects.toMatchObject({ code: 'reauth_required' })

    expect(action).not.toHaveBeenCalled()
    expect(mocks.updates).toContainEqual({
      status: 'error',
      refresh_token_enc: null,
      last_error: 'reauth_required',
    })
    expect(mocks.updates.at(-1)).toEqual({ api_lease_id: null, api_lease_expires_at: null })
  })

  it('does not refresh a connection when another request owns the lease', async () => {
    mocks.claimAllowed = false
    const refresh = vi.fn()

    await expect(withGoogleAdsAccess({
      userId: USER_ID,
      connectionId: CONNECTION_ID,
      provider: provider(refresh),
      action: async () => null,
    })).rejects.toMatchObject({ code: 'connection_busy' })

    expect(refresh).not.toHaveBeenCalled()
  })
})
