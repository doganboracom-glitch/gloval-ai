import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Simulated tests: the Supabase client and admin guard are mocked. They verify
 * the server-action contract (guard first, validation, RPC arguments, audit of
 * blocked attempts) — NOT the SQL functions, which are only exercised against a
 * real database.
 */

const ADMIN_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const PLAN_ID = '33333333-3333-4333-8333-333333333333'

const state = vi.hoisted(() => ({
  adminOk: true,
  rpc: vi.fn(),
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  profileUpdates: [] as Array<{ table: string; patch: Record<string, unknown>; column: string; value: unknown }>,
  liveSub: null as null | { provider: string; provider_ref: string | null; status: string },
  billingTransaction: null as null | {
    id: string
    user_id: string
    kind: string
    status: string
    provider: string
    amount_cents: number
    subscription_id: string | null
    currency: string
  },
  refundRows: [] as Array<{ id: string; kind: string; status: string; provider_ref: string; idempotency_key: string; user_id: string }>,
  clientCreated: 0,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: vi.fn() }))
vi.mock('@/lib/notify', () => ({
  SUPPORT_EMAIL: 'x@y.z',
  notifyAccountReactivated: vi.fn(),
  notifyAccountSuspended: vi.fn(),
  recordNotification: vi.fn(),
  sendTransactionalEmail: vi.fn(),
}))
vi.mock('@/lib/mail/admin-guard', () => ({
  requireAdmin: vi.fn(async () => {
    if (!state.adminOk) throw new Error('NEXT_NOT_FOUND')
    return { email: 'admin@gloval.ai', userId: ADMIN_ID }
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    state.clientCreated++
    return {
      rpc: state.rpc,
      from: (table: string) => {
        const filters: Record<string, unknown> = {}
        const chain: Record<string, unknown> = {}
        for (const method of ['select', 'in', 'order', 'limit']) chain[method] = () => chain
        chain.eq = (column: string, value: unknown) => {
          filters[column] = value
          return chain
        }
        chain.maybeSingle = async () => {
          if (table === 'billing_transactions') {
            if (filters.id === state.billingTransaction?.id) return { data: state.billingTransaction, error: null }
            if (filters.idempotency_key) {
              return { data: state.refundRows.find((row) => row.idempotency_key === filters.idempotency_key) ?? null, error: null }
            }
            if (filters.provider_ref) {
              return { data: state.refundRows.find((row) => row.provider_ref === filters.provider_ref) ?? null, error: null }
            }
          }
          return { data: state.liveSub, error: null }
        }
        chain.single = async () => ({ data: { id: 'refund-row-id' }, error: null })
        chain.insert = (row: Record<string, unknown>) => {
          state.inserts.push({ table, row })
          if (table === 'billing_transactions') {
            state.refundRows.push({
              id: 'refund-row-id',
              kind: String(row.kind),
              status: String(row.status),
              provider_ref: String(row.provider_ref),
              idempotency_key: String(row.idempotency_key),
              user_id: String(row.user_id),
            })
          }
          const result = { data: { id: 'refund-row-id' }, error: null }
          return {
            select: () => chain,
            single: async () => result,
            then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
              Promise.resolve({ error: null }).then(resolve, reject),
          }
        }
        chain.update = (patch: Record<string, unknown>) => ({
          eq: async (column: string, value: unknown) => {
            state.profileUpdates.push({ table, patch, column, value })
            return { error: null }
          },
        })
        return chain
      },
    }
  },
}))

import { changeUserPlan, grantCredits, recordIyzicoRefund, setUserPeriodEnd, setUserSiteLimitOverride, setUserStatus } from './actions'

beforeEach(() => {
  state.adminOk = true
  state.liveSub = null
  state.billingTransaction = null
  state.refundRows = []
  state.inserts = []
  state.profileUpdates = []
  state.clientCreated = 0
  state.rpc.mockReset()
  state.rpc.mockResolvedValue({ data: { ok: true, plan_name: 'Pro' }, error: null })
})

describe('non-admin access', () => {
  it('rejects every admin mutation before any database client is created', async () => {
    state.adminOk = false
    const calls = [
      () => changeUserPlan({ userId: USER_ID, planId: PLAN_ID }),
      () => grantCredits({ userId: USER_ID, amount: 10, reason: 'x' }),
      () => setUserPeriodEnd({ userId: USER_ID, periodEnd: null, reason: 'x' }),
      () => setUserSiteLimitOverride({ userId: USER_ID, siteLimit: 3, reason: 'x' }),
      () => recordIyzicoRefund({ transactionId: USER_ID, providerReference: 'refund-ref' }),
      () => setUserStatus(USER_ID, 'suspended'),
    ]
    for (const call of calls) await expect(call()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(state.clientCreated).toBe(0)
    expect(state.profileUpdates).toEqual([])
    expect(state.rpc).not.toHaveBeenCalled()
  })
})

describe('setUserStatus', () => {
  it('updates only profiles.status through the guarded admin client', async () => {
    expect(await setUserStatus(USER_ID, 'suspended')).toEqual({ ok: true })
    expect(state.clientCreated).toBe(1)
    expect(state.profileUpdates).toEqual([
      { table: 'profiles', patch: { status: 'suspended' }, column: 'id', value: USER_ID },
    ])
  })

  it('rejects invalid status before creating the admin client', async () => {
    expect(await setUserStatus(USER_ID, 'disabled' as never)).toEqual({ ok: false, error: 'invalid_status' })
    expect(state.clientCreated).toBe(0)
    expect(state.profileUpdates).toEqual([])
  })
})

describe('changeUserPlan', () => {
  it('calls the RPC with the admin identity and idempotency key', async () => {
    const key = 'abcdefgh-1234-5678-abcd-000000000001'
    const res = await changeUserPlan({ userId: USER_ID, planId: PLAN_ID, reason: 'goodwill', idempotencyKey: key })
    expect(res).toEqual({ ok: true })
    expect(state.rpc).toHaveBeenCalledWith('admin_change_user_plan', {
      p_admin_email: 'admin@gloval.ai',
      p_admin_id: ADMIN_ID,
      p_user_id: USER_ID,
      p_plan_id: PLAN_ID,
      p_reason: 'goodwill',
      p_idem: key,
      p_ack_no_payment_sync: false,
    })
  })

  it('does not pre-read the subscription in the app layer (the RPC owns the check)', async () => {
    state.liveSub = { provider: 'iyzico', provider_ref: 'sub_1', status: 'active' }
    await changeUserPlan({ userId: USER_ID, planId: PLAN_ID })
    expect(state.rpc).toHaveBeenCalledTimes(1)
  })

  it('surfaces payment_sync_required from the RPC without double-auditing it', async () => {
    state.rpc.mockResolvedValue({ data: { ok: false, error: 'payment_sync_required', audited: true }, error: null })
    const res = await changeUserPlan({ userId: USER_ID, planId: PLAN_ID })
    expect(res).toEqual({ ok: false, error: 'payment_sync_required' })
    expect(state.inserts.some((i) => i.table === 'admin_package_audit')).toBe(false)
    expect(state.inserts.some((i) => i.table === 'notification_logs')).toBe(false)
  })

  it('forwards the explicit acknowledgement to the RPC', async () => {
    await changeUserPlan({ userId: USER_ID, planId: PLAN_ID, acknowledgeNoPaymentSync: true })
    const args = state.rpc.mock.calls[0][1] as { p_ack_no_payment_sync: boolean }
    expect(args.p_ack_no_payment_sync).toBe(true)
  })

  it('rejects malformed ids without touching the database', async () => {
    expect(await changeUserPlan({ userId: 'nope', planId: PLAN_ID })).toEqual({ ok: false, error: 'invalid_user' })
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('audits and returns RPC failures (e.g. payment in flight)', async () => {
    state.rpc.mockResolvedValue({ data: { ok: false, error: 'payment_in_flight' }, error: null })
    expect(await changeUserPlan({ userId: USER_ID, planId: PLAN_ID })).toEqual({ ok: false, error: 'payment_in_flight' })
    expect(state.inserts.some((i) => i.table === 'admin_package_audit' && i.row.status === 'failed')).toBe(true)
  })

  it('does not send a second notification for a duplicate submit', async () => {
    state.rpc.mockResolvedValue({ data: { ok: true, duplicate: true }, error: null })
    await changeUserPlan({ userId: USER_ID, planId: PLAN_ID })
    expect(state.inserts.some((i) => i.table === 'notification_logs')).toBe(false)
  })

  it('never writes to payment tables', async () => {
    await changeUserPlan({ userId: USER_ID, planId: PLAN_ID })
    expect(state.inserts.some((i) => i.table.startsWith('billing_transactions'))).toBe(false)
  })
})

describe('recordIyzicoRefund', () => {
  const charge = {
    id: USER_ID,
    user_id: PLAN_ID,
    kind: 'charge',
    status: 'succeeded',
    provider: 'iyzico',
    amount_cents: 12_105,
    subscription_id: '44444444-4444-4444-8444-444444444444',
    currency: 'TRY',
  }

  it('records an already-completed full refund through the restricted RPC', async () => {
    state.billingTransaction = charge
    state.rpc.mockResolvedValue({
      data: { ok: true, duplicate: false, refundTransactionId: '55555555-5555-4555-8555-555555555555' },
      error: null,
    })

    expect(await recordIyzicoRefund({ transactionId: charge.id, providerReference: 'iyzico-host-ref-1' })).toEqual({
      ok: true,
      duplicate: false,
    })
    expect(state.rpc).toHaveBeenCalledWith('record_iyzico_billing_refund', {
      p_charge_id: charge.id,
      p_provider_ref: 'iyzico-host-ref-1',
      p_idempotency_key: `iyzico-refund:${charge.id}`,
    })
    expect(state.inserts.some((row) => row.table === 'billing_transactions')).toBe(false)
  })

  it('validates transaction and provider reference before creating a database client', async () => {
    expect(await recordIyzicoRefund({ transactionId: 'bad-id', providerReference: 'refund-1' })).toEqual({
      ok: false,
      error: 'invalid_transaction',
    })
    expect(await recordIyzicoRefund({ transactionId: charge.id, providerReference: 'bad reference' })).toEqual({
      ok: false,
      error: 'invalid_refund_reference',
    })
    expect(state.clientCreated).toBe(0)
  })

  it('uses a legacy-schema fallback and prevents the same refund from being recorded twice', async () => {
    state.billingTransaction = charge
    state.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'record_iyzico_billing_refund not found' } })

    const input = { transactionId: charge.id, providerReference: 'iyzico-host-ref-2' }
    expect(await recordIyzicoRefund(input)).toEqual({ ok: true, duplicate: false })
    const refundInsert = state.inserts.find((row) => row.table === 'billing_transactions')
    expect(refundInsert?.row).toMatchObject({
      user_id: charge.user_id,
      kind: 'refund',
      amount_cents: -charge.amount_cents,
      currency: 'TRY',
      status: 'succeeded',
      provider: 'iyzico',
      provider_ref: 'iyzico-host-ref-2',
      idempotency_key: `iyzico-refund:${charge.id}`,
    })

    expect(await recordIyzicoRefund(input)).toEqual({ ok: true, duplicate: true })
    expect(state.inserts.filter((row) => row.table === 'billing_transactions')).toHaveLength(1)
  })

  it('rejects non-successful, non-iyzico, or already-refunded charges', async () => {
    state.billingTransaction = { ...charge, provider: 'stripe' }
    expect(await recordIyzicoRefund({ transactionId: charge.id, providerReference: 'iyzico-host-ref-3' })).toEqual({
      ok: false,
      error: 'payment_not_refundable',
    })
    expect(state.rpc).not.toHaveBeenCalled()
  })
})

describe('grantCredits', () => {
  it('requires a reason and a non-zero amount', async () => {
    expect(await grantCredits({ userId: USER_ID, amount: 5 })).toEqual({ ok: false, error: 'reason_required' })
    expect(await grantCredits({ userId: USER_ID, amount: 0, reason: 'x' })).toEqual({ ok: false, error: 'invalid_amount' })
    expect(await grantCredits({ userId: USER_ID, amount: 2_000_000, reason: 'x' })).toEqual({ ok: false, error: 'amount_too_large' })
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('passes a negative adjustment to the ledger RPC and surfaces the negative-balance block', async () => {
    state.rpc.mockResolvedValue({ data: { ok: false, error: 'insufficient_balance' }, error: null })
    const res = await grantCredits({ userId: USER_ID, amount: -50, reason: 'refund' })
    expect(res).toEqual({ ok: false, error: 'insufficient_balance' })
    expect(state.rpc.mock.calls[0][0]).toBe('admin_adjust_credits')
    expect((state.rpc.mock.calls[0][1] as { p_amount: number }).p_amount).toBe(-50)
  })
})

describe('setUserPeriodEnd', () => {
  it('requires a reason and a valid date', async () => {
    expect(await setUserPeriodEnd({ userId: USER_ID, periodEnd: null })).toEqual({ ok: false, error: 'reason_required' })
    expect(await setUserPeriodEnd({ userId: USER_ID, periodEnd: 'garbage', reason: 'x' })).toEqual({ ok: false, error: 'invalid_period_end' })
  })

  it('normalises the date to ISO and calls the RPC', async () => {
    await setUserPeriodEnd({ userId: USER_ID, periodEnd: '2030-01-01T00:00:00Z', reason: 'extend' })
    expect(state.rpc).toHaveBeenCalledWith(
      'admin_set_period_end',
      expect.objectContaining({ p_period_end: '2030-01-01T00:00:00.000Z', p_reason: 'extend' }),
    )
  })
})

describe('setUserSiteLimitOverride', () => {
  it('validates range, integer and reason', async () => {
    expect(await setUserSiteLimitOverride({ userId: USER_ID, siteLimit: 101, reason: 'x' })).toEqual({ ok: false, error: 'invalid_limit' })
    expect(await setUserSiteLimitOverride({ userId: USER_ID, siteLimit: -1, reason: 'x' })).toEqual({ ok: false, error: 'invalid_limit' })
    expect(await setUserSiteLimitOverride({ userId: USER_ID, siteLimit: 1.5, reason: 'x' })).toEqual({ ok: false, error: 'invalid_limit' })
    expect(await setUserSiteLimitOverride({ userId: USER_ID, siteLimit: 5 })).toEqual({ ok: false, error: 'reason_required' })
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('saves an override and clears it with null without needing a reason', async () => {
    expect(await setUserSiteLimitOverride({ userId: USER_ID, siteLimit: 5, reason: 'vip' })).toEqual({ ok: true })
    expect(await setUserSiteLimitOverride({ userId: USER_ID, siteLimit: null })).toEqual({ ok: true })
    expect(state.rpc).toHaveBeenCalledTimes(2)
    expect((state.rpc.mock.calls[1][1] as { p_site_limit: number | null }).p_site_limit).toBeNull()
  })
})
