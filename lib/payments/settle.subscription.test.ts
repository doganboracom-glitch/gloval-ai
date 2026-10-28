import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
type Db = Record<string, Row[]>

const state = vi.hoisted(() => ({ db: {} as Db }))

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
      const rows = (state.db[table] ??= [])
      const existing = rows.find((r) => r.user_id === p.user_id && r.idempotency_key === p.idempotency_key)
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
      const rows = run()
      return Promise.resolve({ data: wantRows ? rows : null, error: null }).then(resolve, reject)
    },
  }
  return builder
}

vi.mock('@/lib/plan-credit-instant-store', () => ({ grantPlanCreditsAfterPayment: vi.fn() }))
vi.mock('@/lib/mail/access-trigger', () => ({ triggerMailAccessSync: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }),
}))
vi.mock('@/lib/notify', () => ({
  logUserEvent: vi.fn(async () => true),
  formatTicketNumber: (s: string) => s,
}))

import { settlePaymentResult } from './settle'
import { logUserEvent } from '@/lib/notify'
import { grantPlanCreditsAfterPayment } from '@/lib/plan-credit-instant-store'
import type { PaymentWebhookResult } from './types'

const REF = 'tok_subscription_abcdef'
const KEY = 'sub_sub-1_initial'

function seed(ledgerStatus = 'pending') {
  state.db = {
    billing_subscriptions: [
      {
        id: 'sub-1',
        user_id: 'user-1',
        status: 'incomplete',
        plan_id: 'plan-1',
        provider_ref: REF,
        pending_plan_id: null,
        pending_change_ref: null,
      },
    ],
    billing_plans: [{ id: 'plan-1', name: 'Starter', price_cents: 50000, currency: 'TRY' }],
    billing_transactions: [
      {
        id: 'tx-1',
        subscription_id: 'sub-1',
        user_id: 'user-1',
        provider_ref: REF,
        status: ledgerStatus,
        amount_cents: 50000,
        currency: 'TRY',
        idempotency_key: KEY,
        description: 'Starter aboneliği',
      },
    ],
    project_entitlements: [],
    domain_orders: [],
    addon_purchases: [],
  }
}

function result(overrides: Partial<PaymentWebhookResult> = {}): PaymentWebhookResult {
  return {
    reference: REF,
    kind: 'payment',
    status: 'paid',
    paidAmountCents: 50000,
    paidCurrency: 'TRY',
    orderRef: KEY,
    ...overrides,
  } as PaymentWebhookResult
}

const ledger = () => state.db.billing_transactions
const events = () => vi.mocked(logUserEvent).mock.calls.map(([input]) => input)

describe('settlePaymentResult - first subscription payment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    seed()
  })

  it('activates the plan once and claims the success mail under a per-payment dedupe key', async () => {
    expect(await settlePaymentResult('iyzico', result())).toBe('subscription')
    expect(state.db.billing_subscriptions[0].status).toBe('active')
    expect(ledger()).toHaveLength(1)
    expect(ledger()[0].status).toBe('succeeded')
    expect(events()).toHaveLength(1)
    expect(events()[0].dedupeKey).toBe(`payment-succeeded:${REF}`)
  })

  it('concurrent paid results leave one ledger row and one mail key (callback + cron)', async () => {
    await Promise.all([settlePaymentResult('iyzico', result()), settlePaymentResult('iyzico', result())])
    expect(state.db.billing_subscriptions[0].status).toBe('active')
    expect(ledger()).toHaveLength(1)
    expect(ledger()[0].status).toBe('succeeded')
    const keys = new Set(events().map((e) => e.dedupeKey))
    expect(keys).toEqual(new Set([`payment-succeeded:${REF}`]))
    // The grant itself is idempotent in grant_plan_period_credits (advisory lock + ledger key).
    for (const [id] of vi.mocked(grantPlanCreditsAfterPayment).mock.calls) expect(id).toBe('sub-1')
  })

  it('a replayed paid result after settlement does nothing', async () => {
    await settlePaymentResult('iyzico', result())
    vi.mocked(logUserEvent).mockClear()
    vi.mocked(grantPlanCreditsAfterPayment).mockClear()
    await settlePaymentResult('iyzico', result())
    expect(events()).toHaveLength(0)
    expect(grantPlanCreditsAfterPayment).not.toHaveBeenCalled()
  })

  it('a paid result still activates a charge the sweep wrote off as abandoned', async () => {
    seed('abandoned')
    await settlePaymentResult('iyzico', result())
    expect(state.db.billing_subscriptions[0].status).toBe('active')
    expect(ledger()[0].status).toBe('succeeded')
  })
})

describe('settlePaymentResult - failed subscription payment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    seed()
  })

  it('marks a pending charge failed once and mails with a dedupe key', async () => {
    await settlePaymentResult('iyzico', result({ status: 'failed' }))
    expect(ledger()[0].status).toBe('failed')
    expect(events()).toHaveLength(1)
    expect(events()[0].dedupeKey).toBe(`payment-failed:${REF}`)
  })

  it('a replayed failed result neither mails nor touches the charge again', async () => {
    await settlePaymentResult('iyzico', result({ status: 'failed' }))
    vi.mocked(logUserEvent).mockClear()
    await settlePaymentResult('iyzico', result({ status: 'failed' }))
    expect(ledger()[0].status).toBe('failed')
    expect(events()).toHaveLength(0)
  })

  it('a late failed callback cannot turn a succeeded charge into a failed one', async () => {
    await settlePaymentResult('iyzico', result())
    vi.mocked(logUserEvent).mockClear()
    await settlePaymentResult('iyzico', result({ status: 'failed' }))
    expect(ledger()[0].status).toBe('succeeded')
    expect(state.db.billing_subscriptions[0].status).toBe('active')
    expect(events()).toHaveLength(0)
  })
})
