import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  siteLimit: 3,
  logUserEvent: vi.fn(async () => {}),
  grantPlanCreditsAfterPayment: vi.fn(() => {}),
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
    in(c: string, vs: unknown[]) {
      filters.push((r) => vs.includes(r[c]))
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

vi.mock('@/lib/plan-credit-instant-store', () => ({ grantPlanCreditsAfterPayment: state.grantPlanCreditsAfterPayment }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }) }))
vi.mock('@/lib/notify', () => ({
  logUserEvent: (...args: unknown[]) => (state.logUserEvent as (...a: unknown[]) => Promise<void>)(...args),
  formatTicketNumber: (s: string) => s,
}))
vi.mock('@/lib/effective-limits', () => ({ getEffectiveSiteLimit: async () => state.siteLimit }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/custom-domains/provider', () => ({ getDomainProvider: () => ({}) }))
vi.mock('@/lib/custom-domains/registrar/provider', () => ({ getDomainRegistrarProvider: () => ({}) }))

import { settlePaymentResult } from './settle'
import type { PaymentWebhookResult } from './types'

const REF = 'tok_renewal_sub_0001'
const INITIAL_REF = 'tok_initial_sub_0001'
const sub = () => state.db.billing_subscriptions[0]
const txn = () => state.db.billing_transactions.find((t) => t.provider_ref === REF)!
const project = (id: string) => state.db.projects.find((p) => p.id === id)!

function seed(opts: { planCode?: string; projects?: Row[]; suspendedIds?: string[]; status?: string } = {}) {
  state.db = {
    billing_subscriptions: [
      {
        id: 'sub-1',
        user_id: 'user-1',
        plan_id: 'plan-1',
        status: opts.status ?? 'suspended',
        provider_ref: INITIAL_REF,
        current_period_start: '2024-01-01T00:00:00.000Z',
        current_period_end: '2024-02-01T00:00:00.000Z',
        grace_period_ends_at: '2024-02-08T00:00:00.000Z',
        suspended_at: '2024-02-08T00:00:00.000Z',
        suspension_reason: 'payment_overdue',
        suspended_project_ids: opts.suspendedIds ?? [],
        pending_plan_id: null,
        pending_change_ref: null,
      },
    ],
    billing_plans: [{ id: 'plan-1', code: opts.planCode ?? 'pro', name: 'Pro', interval: 'month' }],
    billing_transactions: [
      {
        id: 'tx-initial',
        subscription_id: 'sub-1',
        user_id: 'user-1',
        provider_ref: INITIAL_REF,
        status: 'succeeded',
        amount_cents: 99000,
        currency: 'TRY',
        idempotency_key: 'sub_sub-1_initial',
      },
      {
        id: 'tx-renew',
        subscription_id: 'sub-1',
        user_id: 'user-1',
        provider_ref: REF,
        status: 'pending',
        amount_cents: 99000,
        currency: 'TRY',
        idempotency_key: 'renew_sub-1_1',
      },
    ],
    projects: opts.projects ?? [],
  }
}

function paid(overrides: Partial<PaymentWebhookResult> = {}): PaymentWebhookResult {
  return {
    reference: REF,
    kind: 'payment',
    status: 'paid',
    paidAmountCents: 99000,
    paidCurrency: 'TRY',
    orderRef: 'renew_sub-1_1',
    ...overrides,
  } as PaymentWebhookResult
}

const site = (id: string, created: string, published = false, type = 'corporate'): Row => ({
  id,
  owner_id: 'user-1',
  slug: id,
  published,
  status: published ? 'published' : 'draft',
  project_type: type,
  created_at: created,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  state.siteLimit = 3
  state.grantPlanCreditsAfterPayment.mockClear()
  seed()
})

describe('settlePaymentResult - subscription renewal', () => {
  it('activates a suspended subscription, moves the period and restores sites within the limit (oldest first)', async () => {
    seed({
      suspendedIds: ['a', 'b', 'c', 'd'],
      projects: [site('a', '2024-01-01'), site('b', '2024-01-02'), site('c', '2024-01-03'), site('d', '2024-01-04')],
    })
    expect(await settlePaymentResult('iyzico', paid({ paidCurrency: 'TL' }))).toBe('subscription')

    expect(sub().status).toBe('active')
    expect(new Date(sub().current_period_end as string).getTime()).toBeGreaterThan(Date.now())
    expect(sub().grace_period_ends_at).toBeNull()
    expect(sub().suspended_at).toBeNull()
    expect(sub().suspension_reason).toBeNull()
    expect(sub().suspended_project_ids).toEqual([])
    expect(txn().status).toBe('succeeded')
    expect(['a', 'b', 'c'].every((id) => project(id).published === true)).toBe(true)
    expect(project('d').published).toBe(false)
    expect(state.logUserEvent).toHaveBeenCalledTimes(1)
    expect(state.grantPlanCreditsAfterPayment).toHaveBeenCalledWith('sub-1')
  })

  it('is idempotent: a replayed callback changes and notifies nothing', async () => {
    seed({ suspendedIds: ['a'], projects: [site('a', '2024-01-01')] })
    await settlePaymentResult('iyzico', paid())
    const periodEnd = sub().current_period_end
    project('a').published = false
    await settlePaymentResult('iyzico', paid())
    expect(sub().current_period_end).toBe(periodEnd)
    expect(project('a').published).toBe(false)
    expect(state.logUserEvent).toHaveBeenCalledTimes(1)
    expect(state.grantPlanCreditsAfterPayment).toHaveBeenCalledTimes(1)
  })

  it('keeps the e-commerce plan at 1 e-commerce + corporate sites, never over the total', async () => {
    state.siteLimit = 4
    seed({
      planCode: 'ecommerce',
      suspendedIds: ['e1', 'e2', 'c1', 'c2'],
      projects: [
        site('live-c', '2023-01-01', true),
        site('e1', '2024-01-01', false, 'ecommerce'),
        site('e2', '2024-01-02', false, 'ecommerce'),
        site('c1', '2024-01-03'),
        site('c2', '2024-01-04'),
      ],
    })
    await settlePaymentResult('iyzico', paid())
    expect(project('e1').published).toBe(true)
    expect(project('e2').published).toBe(false)
    expect(project('c1').published).toBe(true)
    expect(project('c2').published).toBe(true)
  })

  it.each([
    ['amount', { paidAmountCents: 1 }],
    ['currency', { paidCurrency: 'USD' }],
  ])('a mismatched %s never renews', async (_n, override) => {
    seed({ suspendedIds: ['a'], projects: [site('a', '2024-01-01')] })
    await settlePaymentResult('iyzico', paid(override as Partial<PaymentWebhookResult>))
    expect(sub().status).toBe('suspended')
    expect(txn().status).toBe('pending')
    expect(project('a').published).toBe(false)
    expect(state.logUserEvent).not.toHaveBeenCalled()
  })

  it('a failed renewal payment is recorded once and never reactivates or restores', async () => {
    seed({ suspendedIds: ['a'], projects: [site('a', '2024-01-01')] })
    await settlePaymentResult('iyzico', paid({ status: 'failed' }))
    await settlePaymentResult('iyzico', paid({ status: 'failed' }))
    expect(txn().status).toBe('failed')
    expect(sub().status).toBe('suspended')
    expect(project('a').published).toBe(false)
    expect(state.logUserEvent).toHaveBeenCalledTimes(1)
  })

  it('a late failed callback does not undo a succeeded renewal', async () => {
    seed({ suspendedIds: ['a'], projects: [site('a', '2024-01-01')] })
    await settlePaymentResult('iyzico', paid())
    await settlePaymentResult('iyzico', paid({ status: 'failed' }))
    expect(txn().status).toBe('succeeded')
    expect(sub().status).toBe('active')
  })

  it('a replay of the ORIGINAL charge never reactivates a lapsed subscription', async () => {
    seed({ status: 'past_due', suspendedIds: [], projects: [] })
    expect(await settlePaymentResult('iyzico', paid({ reference: INITIAL_REF, orderRef: 'sub_sub-1' }))).toBe('subscription')
    expect(sub().status).toBe('past_due')
    expect(state.logUserEvent).not.toHaveBeenCalled()
  })

  it('extends an early renewal from the current period end instead of losing paid time', async () => {
    seed({ status: 'active' })
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString()
    sub().current_period_end = future
    await settlePaymentResult('iyzico', paid())
    expect(sub().current_period_start).toBe(future)
    expect(new Date(sub().current_period_end as string).getTime()).toBeGreaterThan(new Date(future).getTime())
  })
})
