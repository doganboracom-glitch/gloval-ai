import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'

const mocks = vi.hoisted(() => ({
  decrypt: vi.fn(),
  loadKeyring: vi.fn(),
  revoke: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/ads/token-crypto', () => ({
  decryptAdsToken: mocks.decrypt,
  encryptAdsToken: vi.fn(),
  loadAdsTokenKeyring: mocks.loadKeyring,
  adsTokenNeedsRotation: vi.fn(),
}))
vi.mock('@/lib/ads/providers/google-ads-provider', () => ({
  revokeGoogleAdsRefreshToken: mocks.revoke,
}))

import {
  cleanupExpiredGoogleAdsOAuthFlows,
  revokeGoogleAdsOAuthFlowsForDeletion,
} from '@/lib/ads/google-connections'

type FlowRow = {
  id: string
  user_id: string
  state_hash: string
  code_verifier_enc: string | null
  pending_refresh_token_enc: string | null
  status: 'started' | 'exchanging' | 'awaiting_account'
  account_candidates: unknown
  scopes: string[]
  state_consumed_at: string | null
  expires_at: string
  created_at: string
}

function flow(overrides: Partial<FlowRow> = {}): FlowRow {
  return {
    id: '987e6543-e21b-42d3-a456-426614174000',
    user_id: '550e8400-e29b-41d4-a716-446655440000',
    state_hash: 'a'.repeat(64),
    code_verifier_enc: null,
    pending_refresh_token_enc: 'encrypted-pending-token',
    status: 'awaiting_account',
    account_candidates: [{ externalAccountId: '9876543210' }],
    scopes: ['https://www.googleapis.com/auth/adwords'],
    state_consumed_at: new Date().toISOString(),
    expires_at: '2020-01-01T00:00:00.000Z',
    created_at: '2019-12-31T23:45:00.000Z',
    ...overrides,
  }
}

function adminFor(rows: FlowRow[], failDelete = false) {
  return {
    from(table: string) {
      if (table !== 'ads_google_oauth_flows') throw new Error(`Unexpected table: ${table}`)
      const filters: Array<(row: FlowRow) => boolean> = []
      let operation: 'select' | 'delete' | 'insert' = 'select'
      let maxRows = Number.POSITIVE_INFINITY
      let inserted: Record<string, unknown> | null = null
      const builder: Record<string, any> = {}
      const run = () => {
        if (operation === 'insert') {
          if (inserted) rows.push(inserted as unknown as FlowRow)
          return { data: null, error: null }
        }
        const matching = rows.filter((row) => filters.every((filter) => filter(row)))
        if (operation === 'delete') {
          if (failDelete) return { data: null, error: { message: 'delete failed' } }
          if (matching[0]) rows.splice(rows.indexOf(matching[0]), 1)
          return { data: matching.slice(0, 1), error: null }
        }
        return { data: matching.slice(0, maxRows), error: null }
      }
      builder.select = () => builder
      builder.eq = (column: keyof FlowRow, value: unknown) => {
        filters.push((row) => row[column] === value)
        return builder
      }
      builder.not = (column: keyof FlowRow, operator: string, value: unknown) => {
        if (operator === 'is' && value === null) filters.push((row) => row[column] !== null)
        return builder
      }
      builder.lt = (column: keyof FlowRow, value: string) => {
        filters.push((row) => String(row[column]) < value)
        return builder
      }
      builder.order = () => builder
      builder.limit = (value: number) => {
        maxRows = value
        return builder
      }
      builder.delete = () => {
        operation = 'delete'
        return builder
      }
      builder.insert = (value: Record<string, unknown>) => {
        operation = 'insert'
        inserted = value
        return builder
      }
      builder.maybeSingle = async () => {
        const result = run()
        return { data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: result.error }
      }
      builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve)
      return builder
    },
  }
}

const NOW = '2026-10-31T12:00:00.000Z'
const USER_ID = '550e8400-e29b-41d4-a716-446655440000'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadKeyring.mockReturnValue({ activeVersion: 1, keys: new Map([[1, Buffer.alloc(32)]]) })
  mocks.decrypt.mockReturnValue('refresh-token-plaintext')
  mocks.revoke.mockResolvedValue(undefined)
})

describe('Google Ads pending OAuth-token cleanup', () => {
  it('revokes and removes expired pending tokens before the general purge', async () => {
    const rows = [
      flow(),
      flow({
        id: '123e4567-e89b-42d3-a456-426614174000',
        expires_at: '2099-01-01T00:00:00.000Z',
      }),
      flow({
        id: '223e4567-e89b-42d3-a456-426614174000',
        pending_refresh_token_enc: null,
      }),
    ]
    const cleanup = await cleanupExpiredGoogleAdsOAuthFlows(adminFor(rows) as never, NOW)

    expect(mocks.revoke).toHaveBeenCalledWith('refresh-token-plaintext')
    expect(cleanup).toEqual({ flowsRemoved: 1, tokensRevoked: 1, ciphertextsCleared: 1, revokeFailures: 0 })
    expect(rows.map((row) => row.id)).toEqual([
      '123e4567-e89b-42d3-a456-426614174000',
      '223e4567-e89b-42d3-a456-426614174000',
    ])
  })

  it('clears encrypted pending tokens if Google revocation fails', async () => {
    const rows = [flow()]
    mocks.revoke.mockRejectedValueOnce(new GoogleAdsError('disconnect_failed'))
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const cleanup = await cleanupExpiredGoogleAdsOAuthFlows(adminFor(rows) as never, NOW)

    expect(cleanup).toEqual({ flowsRemoved: 1, tokensRevoked: 0, ciphertextsCleared: 1, revokeFailures: 1 })
    expect(rows).toEqual([])
    expect(JSON.stringify(warning.mock.calls)).not.toContain('refresh-token-plaintext')
    warning.mockRestore()
  })

  it('does not report successful cleanup if the encrypted token row cannot be removed', async () => {
    const rows = [flow()]
    await expect(cleanupExpiredGoogleAdsOAuthFlows(adminFor(rows, true) as never, NOW))
      .rejects.toMatchObject({ code: 'provider_error' })
    expect(rows).toHaveLength(1)
  })

  it('revokes pending flow tokens before account deletion and removes their ciphertext', async () => {
    const rows = [flow()]
    await revokeGoogleAdsOAuthFlowsForDeletion(adminFor(rows) as never, USER_ID)

    expect(mocks.revoke).toHaveBeenCalledWith('refresh-token-plaintext')
    expect(rows).toEqual([])
  })

  it('preserves a non-selectable flow when account-deletion revocation fails', async () => {
    const rows = [flow()]
    mocks.revoke.mockRejectedValueOnce(new GoogleAdsError('disconnect_failed'))

    await expect(revokeGoogleAdsOAuthFlowsForDeletion(adminFor(rows) as never, USER_ID))
      .rejects.toMatchObject({ code: 'disconnect_failed' })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.account_candidates).toEqual([])
    expect(rows[0]?.pending_refresh_token_enc).toBe('encrypted-pending-token')
  })
})
