import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
type Db = Record<string, Row[]>

const state = vi.hoisted(() => ({ db: {} as Db }))

function makeBuilder(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let mode: 'select' | 'update' = 'select'
  let patch: Row = {}

  const run = () => {
    const matched = (state.db[table] ?? []).filter((r) => filters.every((f) => f(r)))
    if (mode === 'update') for (const r of matched) Object.assign(r, patch)
    return matched.map((r) => ({ ...r }))
  }

  const builder: Record<string, unknown> = {
    select: () => builder,
    update(p: Row) {
      mode = 'update'
      patch = p
      return builder
    },
    upsert(p: Row) {
      const rows = (state.db[table] ??= [])
      const existing = rows.find(
        (r) => r.user_id === p.user_id && r.idempotency_key === p.idempotency_key,
      )
      if (existing) Object.assign(existing, p)
      else rows.push({ ...p })
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
    limit: () => builder,
    maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      run()
      return Promise.resolve({ data: null, error: null }).then(resolve, reject)
    },
  }
  return builder
}

vi.mock('@/lib/plan-credit-instant-store', () => ({ grantPlanCreditsAfterPayment: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }),
}))
vi.mock('@/lib/notify', () => ({
  logUserEvent: vi.fn(async () => {}),
  formatTicketNumber: (s: string) => s,
}))

import { settlePaymentResult } from './settle'
import type { PaymentWebhookResult } from './types'

const REF = 'tok_entitlement_abcdef'
const PRICE = 100000

function seed(code: string) {
  state.db = {
    billing_subscriptions: [],
    domain_orders: [],
    addon_purchases: [],
    project_entitlements: [
      {
        id: 'ent-1',
        user_id: 'user-1',
        project_id: 'proj-1',
        code,
        name: 'Test hak',
        amount_cents: PRICE,
        currency: 'TRY',
        status: 'inactive',
        provider_ref: REF,
        granted_at: null,
      },
    ],
    billing_transactions: [
      {
        user_id: 'user-1',
        provider_ref: REF,
        status: 'pending',
        idempotency_key: `ent_proj-1_${code}`,
      },
    ],
  }
}

function paid(overrides: Partial<PaymentWebhookResult> = {}, code = 'branding_removal'): PaymentWebhookResult {
  return {
    reference: REF,
    kind: 'payment',
    status: 'paid',
    paidAmountCents: PRICE,
    paidCurrency: 'TRY',
    orderRef: `ent_proj-1_${code}`,
    ...overrides,
  } as PaymentWebhookResult
}

const ent = () => state.db.project_entitlements[0]
const tx = () => state.db.billing_transactions

describe.each(['branding_removal', 'multilang'])('settlePaymentResult - per-site right (%s)', (code) => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    seed(code)
  })

  it('grants the right when the paid amount equals the recorded amount', async () => {
    expect(await settlePaymentResult('iyzico', paid({}, code))).toBe('entitlement')
    expect(ent().status).toBe('active')
    expect(ent().granted_at).toBeTruthy()
    expect(tx()[0].status).toBe('succeeded')
  })

  it('accepts iyzico\'s "TL" currency spelling', async () => {
    await settlePaymentResult('iyzico', paid({ paidCurrency: 'TL' }, code))
    expect(ent().status).toBe('active')
  })

  it.each([
    ['one kuruş too little', { paidAmountCents: PRICE - 1 }],
    ['one kuruş too much', { paidAmountCents: PRICE + 1 }],
    ['zero', { paidAmountCents: 0 }],
    ['wrong currency', { paidCurrency: 'USD' }],
    ['a different order', { orderRef: 'ent_other_project' }],
  ])('does not grant when the charge is %s', async (_label, override) => {
    const outcome = await settlePaymentResult('iyzico', paid(override as Partial<PaymentWebhookResult>, code))
    expect(outcome).toBe('payment_rejected')
    expect(ent().status).toBe('inactive')
    expect(ent().granted_at).toBeNull()
    expect(tx()[0].status).toBe('failed')
  })

  it('does not grant when the provider omits the amount', async () => {
    const outcome = await settlePaymentResult(
      'iyzico',
      paid({ paidAmountCents: undefined }, code),
    )
    expect(outcome).toBe('payment_rejected')
    expect(ent().status).toBe('inactive')
  })

  it('grants only once when the same paid result is replayed', async () => {
    await settlePaymentResult('iyzico', paid({}, code))
    const firstGrant = ent().granted_at
    await settlePaymentResult('iyzico', paid({}, code))
    expect(ent().status).toBe('active')
    expect(ent().granted_at).toBe(firstGrant)
    expect(tx()).toHaveLength(1)
  })

  it('a wrong-amount replay cannot revoke or alter an already active right', async () => {
    await settlePaymentResult('iyzico', paid({}, code))
    const firstGrant = ent().granted_at
    await settlePaymentResult('iyzico', paid({ paidAmountCents: 1 }, code))
    expect(ent().status).toBe('active')
    expect(ent().granted_at).toBe(firstGrant)
  })

  it('does nothing for a failed payment', async () => {
    await settlePaymentResult('iyzico', paid({ status: 'failed' }, code))
    expect(ent().status).toBe('inactive')
  })
})
