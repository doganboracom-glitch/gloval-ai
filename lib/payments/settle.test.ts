import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
type Db = Record<string, Row[]>

const state = vi.hoisted(() => ({
  db: {} as Db,
  registerDomain: vi.fn(),
  addDomain: vi.fn(),
}))

function makeBuilder(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let mode: 'select' | 'update' | 'upsert' = 'select'
  let patch: Row = {}
  let wantRows = false

  const run = () => {
    const rows = state.db[table] ?? []
    const matched = rows.filter((r) => filters.every((f) => f(r)))
    if (mode === 'update') {
      for (const r of matched) Object.assign(r, patch)
      return matched.map((r) => ({ ...r }))
    }
    return matched.map((r) => ({ ...r }))
  }

  const builder: Record<string, unknown> = {
    select() {
      if (mode === 'update') wantRows = true
      return builder
    },
    update(p: Row) {
      mode = 'update'
      patch = p
      return builder
    },
    upsert(p: Row) {
      mode = 'upsert'
      ;(state.db[table] ??= []).push({ ...p })
      return Promise.resolve({ data: null, error: null })
    },
    eq(col: string, val: unknown) {
      filters.push((r) => r[col] === val)
      return builder
    },
    neq(col: string, val: unknown) {
      filters.push((r) => r[col] !== val)
      return builder
    },
    in(col: string, vals: unknown[]) {
      filters.push((r) => vals.includes(r[col]))
      return builder
    },
    limit() {
      return builder
    },
    maybeSingle() {
      const rows = run()
      return Promise.resolve({ data: rows[0] ?? null, error: null })
    },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      const rows = run()
      return Promise.resolve({ data: wantRows ? rows : null, error: null }).then(resolve, reject)
    },
  }
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }),
}))
vi.mock('@/lib/notify', () => ({
  logUserEvent: vi.fn(async () => {}),
  formatTicketNumber: (s: string) => s,
}))
vi.mock('@/lib/custom-domains/provider', () => ({
  getDomainProvider: () => ({ addDomain: state.addDomain }),
}))
vi.mock('@/lib/custom-domains/registrar/provider', () => ({
  getDomainRegistrarProvider: () => ({ registerDomain: state.registerDomain }),
}))

import { settlePaymentResult } from './settle'
import type { PaymentWebhookResult } from './types'

const REF = 'tok_abcdefghijklmnop'
const ORDER_ID = 'order-1'

function seed(status: string) {
  state.db = {
    billing_subscriptions: [],
    project_entitlements: [],
    billing_transactions: [
      { user_id: 'user-1', provider_ref: REF, status: status === 'pending_payment' ? 'pending' : 'succeeded' },
    ],
    domain_orders: [
      {
        id: ORDER_ID,
        user_id: 'user-1',
        domain: 'example.com',
        period_years: 1,
        status,
        price_cents: 90000,
        currency: 'TRY',
        payment_reference: REF,
        provider_response: { contact: { firstName: 'A' } },
      },
    ],
  }
}

function result(overrides: Partial<PaymentWebhookResult> = {}): PaymentWebhookResult {
  return {
    reference: REF,
    kind: 'payment',
    status: 'paid',
    paidAmountCents: 90000,
    paidCurrency: 'TRY',
    orderRef: `domreg_${ORDER_ID}`,
    ...overrides,
  } as PaymentWebhookResult
}

const order = () => state.db.domain_orders[0]

beforeEach(() => {
  vi.clearAllMocks()
  state.registerDomain.mockResolvedValue({ providerDomainId: 'p-1', expiresAt: '2030-01-01' })
  state.addDomain.mockResolvedValue({ id: 'cd-1' })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  seed('pending_payment')
})

describe('settlePaymentResult - domain purchase', () => {
  it('registers the domain when amount, currency and basketId match (TL alias accepted)', async () => {
    const outcome = await settlePaymentResult('iyzico', result({ paidCurrency: 'TL' }))
    expect(outcome).toBe('domain_purchase')
    expect(state.registerDomain).toHaveBeenCalledTimes(1)
    expect(order().status).toBe('active')
  })

  it.each([
    ['amount', { paidAmountCents: 1 }],
    ['currency', { paidCurrency: 'USD' }],
    ['basketId', { orderRef: 'domreg_other-order' }],
  ])('rejects a mismatched %s with payment_mismatch and never registers', async (_n, override) => {
    await settlePaymentResult('iyzico', result(override as Partial<PaymentWebhookResult>))
    expect(state.registerDomain).not.toHaveBeenCalled()
    expect(order().status).toBe('failed')
    expect(order().error_message).toBe('payment_mismatch')
  })

  it.each(['payment_verified', 'registration_pending', 'active'])(
    'a late failed callback does not alter an order in %s',
    async (status) => {
      seed(status)
      await settlePaymentResult('iyzico', result({ status: 'failed' }))
      expect(order().status).toBe(status)
      expect(state.db.billing_transactions[0].status).toBe('succeeded')
      expect(state.registerDomain).not.toHaveBeenCalled()
    },
  )

  it('a duplicate failed callback after a successful settlement keeps the order active', async () => {
    await settlePaymentResult('iyzico', result())
    await settlePaymentResult('iyzico', result({ status: 'failed' }))
    expect(order().status).toBe('active')
    expect(state.registerDomain).toHaveBeenCalledTimes(1)
  })

  it('concurrent paid callbacks register the domain exactly once', async () => {
    state.registerDomain.mockImplementation(
      () => new Promise((r) => setTimeout(() => r({ providerDomainId: 'p-1', expiresAt: '2030-01-01' }), 10)),
    )
    await Promise.all([
      settlePaymentResult('iyzico', result()),
      settlePaymentResult('iyzico', result()),
      settlePaymentResult('iyzico', result()),
    ])
    expect(state.registerDomain).toHaveBeenCalledTimes(1)
    expect(state.addDomain).toHaveBeenCalledTimes(1)
    expect(order().status).toBe('active')
  })

  it('a paid callback arriving after registration does not register again', async () => {
    await settlePaymentResult('iyzico', result())
    await settlePaymentResult('iyzico', result())
    expect(state.registerDomain).toHaveBeenCalledTimes(1)
  })
})
