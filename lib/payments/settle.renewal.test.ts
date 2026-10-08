import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  finalizeRenewal: vi.fn(),
}))

function makeBuilder(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let mode: 'select' | 'update' = 'select'
  let patch: Row = {}
  let wantRows = false
  const run = () => {
    const matched = (state.db[table] ?? []).filter((r) => filters.every((f) => f(r)))
    if (mode === 'update') for (const r of matched) Object.assign(r, patch)
    return matched.map((r) => ({ ...r }))
  }
  const b: Record<string, unknown> = {
    select() {
      if (mode === 'update') wantRows = true
      return b
    },
    update(p: Row) {
      mode = 'update'
      patch = p
      return b
    },
    upsert() {
      return Promise.resolve({ data: null, error: null })
    },
    eq(c: string, v: unknown) {
      filters.push((r) => r[c] === v)
      return b
    },
    neq(c: string, v: unknown) {
      filters.push((r) => r[c] !== v)
      return b
    },
    in(c: string, vs: unknown[]) {
      filters.push((r) => vs.includes(r[c]))
      return b
    },
    limit() {
      return b
    },
    maybeSingle() {
      return Promise.resolve({ data: run()[0] ?? null, error: null })
    },
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
      const rows = run()
      return Promise.resolve({ data: mode === 'update' && !wantRows ? null : rows, error: null }).then(res, rej)
    },
  }
  return b
}

vi.mock('@/lib/plan-credit-instant-store', () => ({ grantPlanCreditsAfterPayment: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }) }))
vi.mock('@/lib/notify', () => ({ logUserEvent: vi.fn(async () => {}), formatTicketNumber: (s: string) => s }))
vi.mock('@/lib/custom-domains/provider', () => ({ getDomainProvider: () => ({ addDomain: vi.fn() }) }))
vi.mock('@/lib/custom-domains/registrar/provider', () => ({ getDomainRegistrarProvider: () => ({}) }))
vi.mock('@/lib/custom-domains/registrar/renewal-service', () => ({
  finalizeRenewal: (id: string) => state.finalizeRenewal(id),
}))

import { settlePaymentResult } from './settle'
import type { PaymentWebhookResult } from './types'

const REF = 'tok_renewal_ref_0001'
const renewal = () => state.db.domain_renewals[0]

function seed(status = 'pending_payment') {
  state.db = {
    billing_subscriptions: [],
    project_entitlements: [],
    domain_orders: [],
    domain_transfers: [],
    billing_transactions: [{ user_id: 'user-1', provider_ref: REF, status: 'pending' }],
    domain_renewals: [
      {
        id: 'r-1',
        user_id: 'user-1',
        domain: 'example.com',
        period_years: 1,
        status,
        price_cents: 54000,
        currency: 'TRY',
        payment_reference: REF,
      },
    ],
  }
}

function paid(overrides: Partial<PaymentWebhookResult> = {}): PaymentWebhookResult {
  return {
    reference: REF,
    kind: 'payment',
    status: 'paid',
    paidAmountCents: 54000,
    paidCurrency: 'TRY',
    orderRef: 'domren_r-1',
    ...overrides,
  } as PaymentWebhookResult
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  state.finalizeRenewal.mockResolvedValue(undefined)
  seed()
})

describe('settlePaymentResult - paid domain renewal', () => {
  it('verifies the payment, marks it paid and hands the row to finalizeRenewal', async () => {
    expect(await settlePaymentResult('iyzico', paid({ paidCurrency: 'TL' }))).toBe('domain_purchase')
    expect(renewal().status).toBe('payment_verified')
    expect(state.db.billing_transactions[0].status).toBe('succeeded')
    expect(state.finalizeRenewal).toHaveBeenCalledTimes(1)
    expect(state.finalizeRenewal).toHaveBeenCalledWith('r-1')
  })

  it.each([
    ['amount', { paidAmountCents: 1 }],
    ['currency', { paidCurrency: 'USD' }],
    ['order reference', { orderRef: 'domren_other' }],
  ])('a mismatched %s never renews and is flagged for a manual refund', async (_n, override) => {
    await settlePaymentResult('iyzico', paid(override as Partial<PaymentWebhookResult>))
    expect(state.finalizeRenewal).not.toHaveBeenCalled()
    expect(renewal().status).toBe('manual_refund_required')
    expect(renewal().error_message).toBe('payment_mismatch')
    expect(state.db.billing_transactions[0].status).toBe('pending')
  })

  it.each(['cancelled', 'failed'])('a payment arriving after the row was %s is flagged, not renewed', async (status) => {
    seed(status)
    await settlePaymentResult('iyzico', paid())
    expect(state.finalizeRenewal).not.toHaveBeenCalled()
    expect(renewal().status).toBe('manual_refund_required')
    expect(renewal().error_message).toBe('late_payment')
  })

  it('a replayed paid callback does not move a settled row backwards', async () => {
    seed('completed')
    await settlePaymentResult('iyzico', paid())
    expect(renewal().status).toBe('completed')
  })
})

describe('settlePaymentResult - failed domain renewal payment', () => {
  it('cancels an unpaid renewal as failed and never calls the registrar', async () => {
    await settlePaymentResult('iyzico', paid({ status: 'failed' }))
    expect(renewal().status).toBe('failed')
    expect(state.finalizeRenewal).not.toHaveBeenCalled()
    expect(state.db.billing_transactions[0].status).toBe('failed')
  })

  it.each(['payment_verified', 'renewal_submitting', 'renewal_reconciliation_required', 'completed'])(
    'a late failed callback does not alter a %s renewal',
    async (status) => {
      seed(status)
      state.db.billing_transactions[0].status = 'succeeded'
      await settlePaymentResult('iyzico', paid({ status: 'failed' }))
      expect(renewal().status).toBe(status)
      expect(state.db.billing_transactions[0].status).toBe('succeeded')
    },
  )
})
