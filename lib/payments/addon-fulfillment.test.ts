import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  failEntitlementUpsert: false,
  failSubscriptionRead: false,
  notifications: [] as Array<Record<string, unknown>>,
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
    upsert(row: Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
      const rows = (state.db[table] ??= [])
      if (table === 'user_addon_entitlements') {
        if (state.failEntitlementUpsert) return Promise.resolve({ data: null, error: { message: 'boom' } })
        if (rows.some((r) => r.idempotency_key === row.idempotency_key)) {
          return Promise.resolve({ data: null, error: null })
        }
        if (row.purchase_id && rows.some((r) => r.purchase_id === row.purchase_id)) {
          return Promise.resolve({ data: null, error: { message: 'duplicate purchase_id' } })
        }
        rows.push({ ...row })
        return Promise.resolve({ data: null, error: null })
      }
      if (table === 'billing_transactions') {
        const existing = rows.find(
          (r) => r.user_id === row.user_id && r.idempotency_key === row.idempotency_key,
        )
        if (existing && !opts?.ignoreDuplicates) Object.assign(existing, row)
        else if (!existing) rows.push({ ...row })
        return Promise.resolve({ data: null, error: null })
      }
      rows.push({ ...row })
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
      if (table === 'billing_subscriptions' && state.failSubscriptionRead) {
        return Promise.resolve({ data: null, error: { message: 'read failed' } })
      }
      return Promise.resolve({ data: run()[0] ?? null, error: null })
    },
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
      const rows = run()
      return Promise.resolve({ data: mode === 'update' && !wantRows ? null : rows, error: null }).then(res, rej)
    },
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }) }))
vi.mock('@/lib/notify', () => ({
  logUserEvent: vi.fn(async (event: Record<string, unknown>) => {
    state.notifications.push(event)
  }),
  formatTicketNumber: (s: string) => s,
}))
vi.mock('@/lib/custom-domains/provider', () => ({ getDomainProvider: () => ({ addDomain: vi.fn() }) }))
vi.mock('@/lib/custom-domains/registrar/provider', () => ({ getDomainRegistrarProvider: () => ({}) }))
vi.mock('@/lib/custom-domains/registrar/renewal-service', () => ({ finalizeRenewal: vi.fn() }))

import { settlePaymentResult } from './settle'
import { settleAddOnResult } from './addon-fulfillment'
import { addOnGrantKey, addOnOrderRef } from '@/lib/addon-purchases'
import type { PaymentWebhookResult } from './types'

const REF = 'tok_addon_ref_0001'
const PURCHASE_ID = 'p-1'
const FUTURE = '2099-01-01T00:00:00.000Z'

const purchase = () => state.db.addon_purchases[0]
const entitlements = () => state.db.user_addon_entitlements

function seed(opts: {
  purchaseStatus?: string
  subStatus?: string
  subUser?: string
  plan?: string
  periodEnd?: string | null
  catalogPrice?: number
} = {}) {
  state.failEntitlementUpsert = false
  state.failSubscriptionRead = false
  state.notifications = []
  state.db = {
    addon_purchases: [
      {
        id: PURCHASE_ID,
        user_id: 'user-1',
        subscription_id: 'sub-1',
        addon_code: 'extra_site_1',
        amount: 9900,
        currency: 'TRY',
        status: opts.purchaseStatus ?? 'pending',
        provider: 'iyzico',
        provider_ref: REF,
      },
    ],
    billing_subscriptions: [
      {
        id: 'sub-1',
        user_id: opts.subUser ?? 'user-1',
        status: opts.subStatus ?? 'active',
        current_period_end: opts.periodEnd === undefined ? FUTURE : opts.periodEnd,
        billing_plans: { code: opts.plan ?? 'pro' },
      },
    ],
    billing_plans: [
      {
        code: 'extra_site_1',
        price_cents: opts.catalogPrice ?? 9900,
        currency: 'TRY',
        interval: 'month',
        product_category: 'addon',
        active: true,
      },
    ],
    user_addon_entitlements: [],
    billing_transactions: [],
    project_entitlements: [],
    domain_orders: [],
    domain_transfers: [],
    domain_renewals: [],
  }
}

function paid(overrides: Partial<PaymentWebhookResult> = {}): PaymentWebhookResult {
  return {
    reference: REF,
    kind: 'payment',
    status: 'paid',
    paidAmountCents: 9900,
    paidCurrency: 'TL',
    orderRef: addOnOrderRef(PURCHASE_ID),
    ...overrides,
  } as PaymentWebhookResult
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  seed()
})

describe('settlePaymentResult - successful add-on payment', () => {
  it('moves pending -> paid -> granted and creates exactly one entitlement', async () => {
    expect(await settlePaymentResult('iyzico', paid())).toBe('addon_purchase')
    expect(purchase().status).toBe('granted')
    expect(entitlements()).toHaveLength(1)
    expect(entitlements()[0]).toMatchObject({
      user_id: 'user-1',
      subscription_id: 'sub-1',
      addon_code: 'extra_site_1',
      status: 'active',
    })
  })

  it('links the entitlement to the purchase', async () => {
    await settlePaymentResult('iyzico', paid())
    expect(entitlements()[0].purchase_id).toBe(PURCHASE_ID)
    expect(entitlements()[0].idempotency_key).toBe(addOnGrantKey(PURCHASE_ID))
  })

  it('takes expires_at from the live subscription current_period_end', async () => {
    seed({ periodEnd: '2031-05-06T07:08:09.000Z' })
    await settlePaymentResult('iyzico', paid())
    expect(entitlements()[0].expires_at).toBe('2031-05-06T07:08:09.000Z')
  })

  it('does not reject a purchase because little of the billing period remains', async () => {
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    seed({ periodEnd: soon })
    expect(await settleAddOnResult('iyzico', paid())).toBe('granted')
    expect(entitlements()[0].expires_at).toBe(soon)
  })

  it('records the charge in the ledger once', async () => {
    await settlePaymentResult('iyzico', paid())
    expect(state.db.billing_transactions).toHaveLength(1)
    expect(state.db.billing_transactions[0]).toMatchObject({
      user_id: 'user-1',
      subscription_id: 'sub-1',
      amount_cents: 9900,
      currency: 'TRY',
      status: 'succeeded',
      provider_ref: REF,
      idempotency_key: `addon_${PURCHASE_ID}`,
    })
  })

  it('works for an e-commerce plan as well', async () => {
    seed({ plan: 'ecommerce' })
    expect(await settleAddOnResult('iyzico', paid())).toBe('granted')
  })

  it('accepts TRY as well as TL for the paid currency', async () => {
    expect(await settleAddOnResult('iyzico', paid({ paidCurrency: 'TRY' }))).toBe('granted')
  })
})

describe('settlePaymentResult - failed add-on payment', () => {
  it('moves pending -> failed and gives no entitlement', async () => {
    expect(await settlePaymentResult('iyzico', paid({ status: 'failed' }))).toBe('addon_purchase')
    expect(purchase().status).toBe('failed')
    expect(entitlements()).toHaveLength(0)
  })

  it.each(['paid', 'granted', 'manual_refund_required'])(
    'a late failed callback does not alter a %s purchase',
    async (status) => {
      seed({ purchaseStatus: status })
      await settleAddOnResult('iyzico', paid({ status: 'failed' }))
      expect(purchase().status).toBe(status)
    },
  )
})

describe('settlePaymentResult - rejected add-on payment', () => {
  const refund = async (override: Partial<PaymentWebhookResult> = {}) => {
    await settlePaymentResult('iyzico', paid(override))
    expect(purchase().status).toBe('manual_refund_required')
    expect(entitlements()).toHaveLength(0)
    expect(state.db.billing_transactions).toHaveLength(0)
  }

  it('amount mismatch', async () => refund({ paidAmountCents: 100 }))
  it('currency mismatch', async () => refund({ paidCurrency: 'USD' }))
  it('order reference (provider_ref) mismatch', async () => refund({ orderRef: 'addon_someone-else' }))
  it('a result that does not prove the amount, currency and basket id', async () => {
    await refund({ paidAmountCents: undefined })
  })
  it('a missing order reference', async () => refund({ orderRef: undefined }))

  it('subscription belonging to another user', async () => {
    seed({ subUser: 'user-2' })
    await refund()
  })

  it('subscription that no longer exists', async () => {
    seed()
    state.db.billing_subscriptions = []
    await refund()
  })

  it('plan not eligible for add-ons', async () => {
    seed({ plan: 'starter' })
    await refund()
  })

  it.each(['past_due', 'trialing', 'canceled', 'incomplete'])(
    'subscription that is %s, not active, at payment time',
    async (subStatus) => {
      seed({ subStatus })
      await refund()
    },
  )

  it('subscription whose billing period already ended', async () => {
    seed({ periodEnd: '2000-01-01T00:00:00.000Z' })
    await refund()
  })

  it('subscription without a period end', async () => {
    seed({ periodEnd: null })
    await refund()
  })

  it('purchase price that no longer matches the catalog', async () => {
    seed({ catalogPrice: 19900 })
    await refund()
  })

  it('a payment arriving after the purchase had already failed', async () => {
    seed({ purchaseStatus: 'failed' })
    await refund()
  })

  it('tells the admin which purchase needs a manual refund', async () => {
    seed({ subUser: 'user-2' })
    await settleAddOnResult('iyzico', paid())
    expect(state.notifications).toHaveLength(1)
    expect(state.notifications[0]).toMatchObject({ userId: 'user-1', emailAdmin: true })
  })
})

describe('settlePaymentResult - idempotency', () => {
  it('the same callback twice creates one entitlement', async () => {
    expect(await settleAddOnResult('iyzico', paid())).toBe('granted')
    expect(await settleAddOnResult('iyzico', paid())).toBe('already_settled')
    expect(entitlements()).toHaveLength(1)
    expect(state.db.billing_transactions).toHaveLength(1)
    expect(state.notifications).toHaveLength(1)
  })

  it('different callbacks for the same provider_ref grant once', async () => {
    await settleAddOnResult('iyzico', paid())
    await settleAddOnResult('iyzico', paid({ kind: 'subscription' }))
    await settlePaymentResult('iyzico', paid({ paidCurrency: 'TRY' }))
    expect(entitlements()).toHaveLength(1)
    expect(purchase().status).toBe('granted')
  })

  it('concurrent callbacks for the same purchase grant once and notify once', async () => {
    const outcomes = await Promise.all([
      settleAddOnResult('iyzico', paid()),
      settleAddOnResult('iyzico', paid()),
      settleAddOnResult('iyzico', paid()),
    ])
    expect(entitlements()).toHaveLength(1)
    expect(purchase().status).toBe('granted')
    expect(outcomes.filter((o) => o === 'granted')).toHaveLength(1)
    expect(state.notifications).toHaveLength(1)
  })

  it('a replayed callback does not extend an already granted entitlement', async () => {
    await settleAddOnResult('iyzico', paid())
    state.db.billing_subscriptions[0].current_period_end = '2100-01-01T00:00:00.000Z'
    await settleAddOnResult('iyzico', paid())
    expect(entitlements()).toHaveLength(1)
    expect(entitlements()[0].expires_at).toBe(FUTURE)
  })

  it('a replayed paid callback does not move a manual_refund_required purchase', async () => {
    seed({ purchaseStatus: 'manual_refund_required' })
    expect(await settleAddOnResult('iyzico', paid())).toBe('already_settled')
    expect(purchase().status).toBe('manual_refund_required')
    expect(entitlements()).toHaveLength(0)
  })
})

describe('settlePaymentResult - retry', () => {
  it('a grant database error keeps the purchase paid and a later callback completes it', async () => {
    state.failEntitlementUpsert = true
    expect(await settleAddOnResult('iyzico', paid())).toBe('retry_pending')
    expect(purchase().status).toBe('paid')
    expect(entitlements()).toHaveLength(0)

    state.failEntitlementUpsert = false
    expect(await settleAddOnResult('iyzico', paid())).toBe('granted')
    expect(purchase().status).toBe('granted')
    expect(entitlements()).toHaveLength(1)
    expect(entitlements()[0].purchase_id).toBe(PURCHASE_ID)
  })

  it('a subscription read error keeps the purchase paid for a retry', async () => {
    state.failSubscriptionRead = true
    expect(await settleAddOnResult('iyzico', paid())).toBe('retry_pending')
    expect(purchase().status).toBe('paid')
    expect(entitlements()).toHaveLength(0)

    state.failSubscriptionRead = false
    expect(await settleAddOnResult('iyzico', paid())).toBe('granted')
    expect(entitlements()).toHaveLength(1)
  })

  it('a purchase left paid after a crash is fulfilled once by the next callback', async () => {
    seed({ purchaseStatus: 'paid' })
    expect(await settleAddOnResult('iyzico', paid())).toBe('granted')
    expect(await settleAddOnResult('iyzico', paid())).toBe('already_settled')
    expect(entitlements()).toHaveLength(1)
  })

  it('a paid purchase whose subscription became ineligible is refunded, not retried forever', async () => {
    seed({ purchaseStatus: 'paid', subStatus: 'canceled' })
    expect(await settleAddOnResult('iyzico', paid())).toBe('manual_refund_required')
    expect(purchase().status).toBe('manual_refund_required')
  })
})

describe('settlePaymentResult - routing', () => {
  it('an unrelated reference is not treated as an add-on purchase', async () => {
    expect(await settleAddOnResult('iyzico', paid({ reference: 'tok_unknown' }))).toBeNull()
    expect(await settlePaymentResult('iyzico', paid({ reference: 'tok_unknown', kind: 'payment' }))).toBe('no_match')
    expect(purchase().status).toBe('pending')
  })

  it('a refunded event changes nothing', async () => {
    expect(await settleAddOnResult('iyzico', paid({ status: 'refunded' }))).toBe('ignored')
    expect(purchase().status).toBe('pending')
  })
})
