import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authState: { kind: 'authenticated', user: { id: '11111111-1111-4111-8111-111111111111' } } as any,
  partner: {
    id: '22222222-2222-4222-8222-222222222222',
    status: 'active',
    tax_status: 'individual',
    iban_last4: '1234',
    tax_verified_at: '2026-11-04T12:00:00.000Z',
  } as any,
  balance: {} as Record<string, unknown>,
  balanceError: null as Error | null,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/request-user', () => ({
  getRequestUser: vi.fn(async () => state.authState),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.partner, error: null }),
        }),
      }),
    }),
    rpc: async (name: string) => name === 'referral_sync_commissions'
      ? { data: null, error: null }
      : { data: state.balance, error: state.balanceError },
  })),
}))

import { getReferralPayoutPanelData } from './payout-data'

beforeEach(() => {
  vi.stubEnv('REFERRAL_ENABLED', '1')
  vi.stubEnv('REFERRAL_PAYOUTS_ENABLED', '1')
  state.authState = { kind: 'authenticated', user: { id: '11111111-1111-4111-8111-111111111111' } }
  state.partner = {
    id: '22222222-2222-4222-8222-222222222222',
    status: 'active',
    tax_status: 'individual',
    iban_last4: '1234',
    tax_verified_at: '2026-11-04T12:00:00.000Z',
  }
  state.balance = {
    pendingCents: 500,
    availableCents: 700,
    totalCents: 1_200,
    requestedCents: 0,
    convertedCents: 0,
    paidCents: 0,
    hasOpenCashRequest: false,
  }
  state.balanceError = null
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('referral payout panel data', () => {
  it('falls back to availableCents when an older balance RPC omits convertibleCents', async () => {
    const data = await getReferralPayoutPanelData()

    expect(data?.state).toMatchObject({
      pendingCents: 500,
      availableCents: 700,
      totalCents: 1_200,
      convertibleCents: 700,
    })
  })

  it('uses the full convertible total from the updated balance RPC', async () => {
    state.balance.convertibleCents = 1_200

    const data = await getReferralPayoutPanelData()

    expect(data?.state?.convertibleCents).toBe(1_200)
    expect(data?.state?.totalCents).toBe(1_200)
  })
})
