import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  auth: { kind: 'authenticated', user: { id: '11111111-1111-4111-8111-111111111111' } } as any,
  partner: { id: '22222222-2222-4222-8222-222222222222', status: 'active', iban_last4: '1234', tax_status: 'individual', terms_version: 'v1.2' } as any,
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
import { REFERRAL_TERMS_VERSION } from './terms'

beforeEach(() => {
  state.auth = { kind: 'authenticated', user: { id: '11111111-1111-4111-8111-111111111111' } }
  state.partner = { id: '22222222-2222-4222-8222-222222222222', status: 'active', iban_last4: '1234', tax_status: 'individual', terms_version: REFERRAL_TERMS_VERSION }
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

  it('maps empty credit balances separately from the cash minimum', async () => {
    vi.stubEnv('REFERRAL_ENABLED', '1')
    vi.stubEnv('REFERRAL_PAYOUTS_ENABLED', '1')
    vi.stubEnv('REFERRAL_CASH_PAYOUTS_ENABLED', '1')

    state.rpcData = { ok: false, error: 'insufficient_balance', availableCents: 0 }
    await expect(createReferralPayoutRequest({
      method: 'credit',
      idempotencyKey: '66666666-6666-4666-8666-666666666666',
    })).resolves.toEqual({ ok: false, error: 'credit_balance_empty' })

    state.rpcData = { ok: false, error: 'minimum_not_met' }
    await expect(createReferralPayoutRequest({
      method: 'credit',
      idempotencyKey: '77777777-7777-4777-8777-777777777777',
    })).resolves.toEqual({ ok: false, error: 'credit_balance_empty' })
    await expect(createReferralPayoutRequest({
      method: 'cash',
      idempotencyKey: '88888888-8888-4888-8888-888888888888',
    })).resolves.toEqual({ ok: false, error: 'minimum_not_met' })
  })

  it('requires current terms before allowing payout actions', async () => {
    vi.stubEnv('REFERRAL_ENABLED', '1')
    vi.stubEnv('REFERRAL_PAYOUTS_ENABLED', '1')
    state.partner = { ...state.partner, terms_version: 'v1.1' }

    await expect(createReferralPayoutRequest({
      method: 'credit',
      idempotencyKey: 'abababab-abab-4bab-8bab-abababababab',
    })).resolves.toEqual({ ok: false, error: 'terms_required' })
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('sends partial amounts and company VAT mode to SQL and includes the breakdown in both emails', async () => {
    vi.stubEnv('REFERRAL_ENABLED', '1')
    vi.stubEnv('REFERRAL_PAYOUTS_ENABLED', '1')
    vi.stubEnv('REFERRAL_CASH_PAYOUTS_ENABLED', '1')
    state.partner = {
      id: '22222222-2222-4222-8222-222222222222',
      status: 'active',
      iban_last4: '1234',
      tax_status: 'company',
      terms_version: REFERRAL_TERMS_VERSION,
    }
    state.rpcData = {
      ok: true,
      requestId: '33333333-3333-4333-8333-333333333333',
      balanceCents: 100_005,
      payoutCents: 120_006,
      invoiceRequired: true,
      partial: true,
      vatMode: 'added',
      invoiceNetCents: 100_005,
      invoiceVatCents: 20_001,
      invoiceGrossCents: 120_006,
    }

    const result = await createReferralPayoutRequest({
      method: 'cash',
      amountCents: 100_005,
      vatMode: 'added',
      idempotencyKey: '99999999-9999-4999-8999-999999999999',
      lang: 'en',
    })

    expect(state.rpc).toHaveBeenCalledWith('request_referral_payout', expect.objectContaining({
      p_amount_cents: 100_005,
      p_vat_mode: 'added',
    }))
    expect(result).toMatchObject({
      ok: true,
      partial: true,
      balanceCents: 100_005,
      payoutCents: 120_006,
      vatMode: 'added',
      invoiceNetCents: 100_005,
      invoiceVatCents: 20_001,
      invoiceGrossCents: 120_006,
    })
    expect(state.queue).toHaveBeenCalledTimes(2)
    expect(state.queue).toHaveBeenCalledWith(expect.objectContaining({
      type: 'referral_cash_requested',
      amountCents: 120_006,
      commissionCents: 100_005,
      partial: true,
      vatMode: 'added',
      invoiceNetCents: 100_005,
      invoiceVatCents: 20_001,
      invoiceGrossCents: 120_006,
    }))
  })

  it('returns feature_unavailable for extended requests when the new SQL RPC is missing without queuing notifications', async () => {
    vi.stubEnv('REFERRAL_ENABLED', '1')
    vi.stubEnv('REFERRAL_PAYOUTS_ENABLED', '1')
    vi.stubEnv('REFERRAL_CASH_PAYOUTS_ENABLED', '1')
    state.rpcError = {
      code: 'PGRST202',
      message: 'Could not find the function public.request_referral_payout in the schema cache',
    }

    await expect(createReferralPayoutRequest({
      method: 'cash',
      amountCents: 100_000,
      idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })).resolves.toEqual({ ok: false, error: 'feature_unavailable' })
    expect(state.rpc).toHaveBeenCalledTimes(1)
    expect(state.queue).not.toHaveBeenCalled()
  })

  it('keeps full credit calls on the legacy four-argument RPC contract', async () => {
    vi.stubEnv('REFERRAL_ENABLED', '1')
    vi.stubEnv('REFERRAL_PAYOUTS_ENABLED', '1')
    vi.stubEnv('REFERRAL_CASH_PAYOUTS_ENABLED', '1')

    await createReferralPayoutRequest({
      method: 'credit',
      idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    })
    const [, args] = state.rpc.mock.calls[0]
    expect(args).not.toHaveProperty('p_amount_cents')
    expect(args).not.toHaveProperty('p_vat_mode')
  })

  it('keeps full company cash requests on the legacy RPC while the extended SQL is unapplied', async () => {
    vi.stubEnv('REFERRAL_ENABLED', '1')
    vi.stubEnv('REFERRAL_PAYOUTS_ENABLED', '1')
    vi.stubEnv('REFERRAL_CASH_PAYOUTS_ENABLED', '1')
    state.partner.tax_status = 'company'
    state.rpcData = {
      ok: true,
      requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      method: 'cash',
      balanceCents: 100_000,
      payoutCents: 120_000,
      creditAmount: null,
      systemTopupCents: 0,
      invoiceRequired: true,
    }

    const result = await createReferralPayoutRequest({
      method: 'cash',
      idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    })
    expect(result).toMatchObject({
      ok: true,
      method: 'cash',
      balanceCents: 100_000,
      payoutCents: 120_000,
      invoiceRequired: true,
      partial: false,
      vatMode: null,
    })
    const [, args] = state.rpc.mock.calls[0]
    expect(args).not.toHaveProperty('p_amount_cents')
    expect(args).not.toHaveProperty('p_vat_mode')
    expect(state.queue).toHaveBeenCalledWith(expect.objectContaining({
      type: 'referral_cash_requested',
      amountCents: 120_000,
      commissionCents: 100_000,
      invoiceRequired: true,
    }))
  })
})
