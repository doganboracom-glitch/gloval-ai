import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  auth: { kind: 'authenticated', user: { id: '11111111-1111-4111-8111-111111111111' } } as any,
  partner: { id: '22222222-2222-4222-8222-222222222222', status: 'active', iban_last4: '1234' } as any,
  rpcData: {
    ok: true,
    duplicate: false,
    requestId: '33333333-3333-4333-8333-333333333333',
    method: 'credit',
    status: 'processed',
    balanceCents: 100_000,
    payoutCents: 100_000,
    creditAmount: 334,
    systemTopupCents: 200,
    invoiceRequired: false,
  } as any,
  rpcError: null as any,
  authCalls: 0,
  adminCalls: 0,
  rpc: vi.fn(),
  queue: vi.fn(),
}))

vi.mock('@/lib/supabase/request-user', () => ({
  getRequestUser: vi.fn(async () => {
    state.authCalls += 1
    return state.auth
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    state.adminCalls += 1
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: state.partner, error: null }),
    }
    return {
      from: () => builder,
      rpc: (...args: unknown[]) => state.rpc(...args),
    }
  }),
}))
vi.mock('@/lib/referrals/email-outbox', () => ({
  queueReferralPayoutNotification: (...args: unknown[]) => state.queue(...args),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createReferralPayoutRequest } from './payout-actions'

beforeEach(() => {
  state.auth = { kind: 'authenticated', user: { id: '11111111-1111-4111-8111-111111111111' } }
  state.partner = { id: '22222222-2222-4222-8222-222222222222', status: 'active', iban_last4: '1234' }
  state.rpcData = {
    ok: true,
    duplicate: false,
    requestId: '33333333-3333-4333-8333-333333333333',
    method: 'credit',
    status: 'processed',
    balanceCents: 100_000,
    payoutCents: 100_000,
    creditAmount: 334,
    systemTopupCents: 200,
    invoiceRequired: false,
  }
  state.rpcError = null
  state.authCalls = 0
  state.adminCalls = 0
  state.rpc.mockReset().mockImplementation(async () => ({ data: state.rpcData, error: state.rpcError }))
  state.queue.mockReset().mockResolvedValue(undefined)
})

afterEach(() => vi.unstubAllEnvs())

describe('referral payout feature flags', () => {
  it('rejects requests and avoids auth/database access when referrals or payouts are off', async () => {
    vi.stubEnv('REFERRAL_ENABLED', '1')
    vi.stubEnv('REFERRAL_PAYOUTS_ENABLED', '0')
    vi.stubEnv('REFERRAL_CASH_PAYOUTS_ENABLED', '1')

    await expect(createReferralPayoutRequest({ method: 'credit', idempotencyKey: '44444444-4444-4444-8444-444444444444' }))
      .resolves.toEqual({ ok: false, error: 'payout_disabled' })
    expect(state.authCalls).toBe(0)
    expect(state.adminCalls).toBe(0)

    vi.stubEnv('REFERRAL_ENABLED', '0')
    vi.stubEnv('REFERRAL_PAYOUTS_ENABLED', '1')
    await expect(createReferralPayoutRequest({ method: 'credit', idempotencyKey: '44444444-4444-4444-8444-444444444444' }))
      .resolves.toEqual({ ok: false, error: 'payout_disabled' })
    expect(state.authCalls).toBe(0)
    expect(state.adminCalls).toBe(0)
  })

  it('rejects cash requests when the cash flag is off, while allowing credit requests when payouts are enabled', async () => {
    vi.stubEnv('REFERRAL_ENABLED', '1')
    vi.stubEnv('REFERRAL_PAYOUTS_ENABLED', '1')
    vi.stubEnv('REFERRAL_CASH_PAYOUTS_ENABLED', '0')

    await expect(createReferralPayoutRequest({ method: 'cash', idempotencyKey: '44444444-4444-4444-8444-444444444444' }))
      .resolves.toEqual({ ok: false, error: 'cash_disabled' })
    expect(state.authCalls).toBe(0)
    expect(state.adminCalls).toBe(0)

    const result = await createReferralPayoutRequest({
      method: 'credit',
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
      lang: 'tr',
    })
    expect(result).toMatchObject({ ok: true, method: 'credit', creditAmount: 334, systemTopupCents: 200 })
    expect(state.rpc).toHaveBeenCalledWith('request_referral_payout', expect.objectContaining({ p_method: 'credit' }))
    expect(state.queue).toHaveBeenCalledOnce()
  })
})
