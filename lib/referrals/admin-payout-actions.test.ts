import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  adminError: null as Error | null,
  adminCalls: 0,
  clientCalls: 0,
  currentTable: '',
  payout: null as any,
  partner: null as any,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  auditResult: true as unknown,
  decryptResult: { ok: true, iban: 'TR000000000000000000000000' } as any,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/mail/admin-guard', () => ({
  requireAdmin: vi.fn(async () => {
    state.adminCalls += 1
    if (state.adminError) throw state.adminError
    return { userId: '11111111-1111-4111-8111-111111111111', email: 'admin@gloval.test' }
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    state.clientCalls += 1
    return {
      from: (table: string) => {
        state.currentTable = table
        const query: any = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({
            data: state.currentTable === 'referral_payout_requests' ? state.payout : state.partner,
            error: null,
          }),
        }
        return query
      },
      rpc: async (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args })
        return { data: state.auditResult, error: null }
      },
    }
  }),
}))
vi.mock('@/lib/referrals/partner-encryption', () => ({
  decryptReferralIban: vi.fn(async () => state.decryptResult),
}))
vi.mock('@/lib/referrals/email-outbox', () => ({
  queueReferralPayoutNotification: vi.fn(),
}))

import { revealReferralPayoutIban, reverseReferralCommissionManually } from './admin-payout-actions'

const PARTNER_ID = '22222222-2222-4222-8222-222222222222'
const REQUEST_ID = '33333333-3333-4333-8333-333333333333'
const COMMISSION_ID = '44444444-4444-4444-8444-444444444444'

beforeEach(() => {
  state.adminError = null
  state.adminCalls = 0
  state.clientCalls = 0
  state.currentTable = ''
  state.payout = { id: REQUEST_ID, partner_id: PARTNER_ID, method: 'cash', status: 'requested' }
  state.partner = { iban_ciphertext: 'encrypted-iban', iban_key_version: 'v1' }
  state.rpcCalls = []
  state.auditResult = true
  state.decryptResult = { ok: true, iban: 'TR000000000000000000000000' }
  vi.stubEnv('REFERRAL_ENABLED', '1')
  vi.stubEnv('REFERRAL_PAYOUTS_ENABLED', '1')
  vi.stubEnv('REFERRAL_CASH_PAYOUTS_ENABLED', '1')
})

afterEach(() => vi.unstubAllEnvs())

describe('admin referral payout actions', () => {
  it('requires admin authorization before reading payout or IBAN data', async () => {
    state.adminError = new Error('not_admin')

    await expect(revealReferralPayoutIban({ partnerId: PARTNER_ID, requestId: REQUEST_ID })).rejects.toThrow('not_admin')
    expect(state.adminCalls).toBe(1)
    expect(state.clientCalls).toBe(0)
  })

  it('requires all payout flags before looking up an IBAN', async () => {
    vi.stubEnv('REFERRAL_CASH_PAYOUTS_ENABLED', '0')

    await expect(revealReferralPayoutIban({ partnerId: PARTNER_ID, requestId: REQUEST_ID })).resolves.toEqual({
      ok: false,
      error: 'cash_disabled',
    })
    expect(state.adminCalls).toBe(1)
    expect(state.clientCalls).toBe(0)
  })

  it('audits the admin reveal and returns plaintext only from the one-time action result', async () => {
    const result = await revealReferralPayoutIban({ partnerId: PARTNER_ID, requestId: REQUEST_ID })

    expect(result).toEqual({ ok: true, requestId: REQUEST_ID, iban: 'TR000000000000000000000000' })
    expect(state.rpcCalls).toEqual([{
      name: 'record_referral_payout_iban_reveal',
      args: {
        p_partner_id: PARTNER_ID,
        p_request_id: REQUEST_ID,
        p_actor_user_id: '11111111-1111-4111-8111-111111111111',
      },
    }])
  })

  it('does not reveal non-cash or non-requested records', async () => {
    state.payout = { ...state.payout, status: 'processed' }

    await expect(revealReferralPayoutIban({ partnerId: PARTNER_ID, requestId: REQUEST_ID })).resolves.toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('requires an audit reason before calling the manual reversal RPC', async () => {
    await expect(reverseReferralCommissionManually({ commissionId: COMMISSION_ID, reason: '  ' })).resolves.toEqual({
      ok: false,
      error: 'invalid_reason',
    })

    expect(state.adminCalls).toBe(1)
    expect(state.clientCalls).toBe(0)
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('records a manual provider refund as an audited commission reversal without requiring cash payouts', async () => {
    vi.stubEnv('REFERRAL_CASH_PAYOUTS_ENABLED', '0')
    state.auditResult = { ok: true, alreadyProcessed: false, commissionId: COMMISSION_ID }

    await expect(reverseReferralCommissionManually({
      commissionId: COMMISSION_ID,
      reason: ' Iyzico panel refund confirmed ',
    })).resolves.toEqual({ ok: true, commissionId: COMMISSION_ID, alreadyProcessed: false })

    expect(state.rpcCalls).toEqual([{
      name: 'referral_admin_reverse_commission',
      args: {
        p_commission_id: COMMISSION_ID,
        p_actor_user_id: '11111111-1111-4111-8111-111111111111',
        p_reason: 'Iyzico panel refund confirmed',
      },
    }])
  })

  it('requires admin authorization before requesting a manual reversal', async () => {
    state.adminError = new Error('not_admin')

    await expect(reverseReferralCommissionManually({
      commissionId: COMMISSION_ID,
      reason: 'Iyzico panel refund confirmed',
    })).rejects.toThrow('not_admin')
    expect(state.adminCalls).toBe(1)
    expect(state.clientCalls).toBe(0)
  })

  it('surfaces idempotent retries returned by the database', async () => {
    state.auditResult = { ok: true, alreadyProcessed: true, commissionId: COMMISSION_ID }

    await expect(reverseReferralCommissionManually({
      commissionId: COMMISSION_ID,
      reason: 'Iyzico panel refund confirmed',
    })).resolves.toEqual({ ok: true, commissionId: COMMISSION_ID, alreadyProcessed: true })
  })
})
