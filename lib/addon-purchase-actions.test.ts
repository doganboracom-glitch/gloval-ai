import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const m = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  db: {} as Record<string, Row[]>,
  touched: new Set<string>(),
  nextId: 1,
  forceInsertConflict: false,
  createIntent: vi.fn(),
}))

vi.mock('next/headers', () => ({ headers: async () => ({ get: () => null }) }))
vi.mock('@/lib/notify', () => ({
  logUserEvent: vi.fn(),
  formatTicketNumber: (ref: string) => ref,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: m.user } }) } }),
}))
vi.mock('@/lib/payments', () => ({
  getPlatformPaymentProviderId: () => 'iyzico',
  getPlatformPaymentProvider: () => ({
    capabilities: { synchronous: false },
    createIntent: m.createIntent,
  }),
}))

/**
 * Minimal in-memory Supabase stand-in. It really applies eq/in/is filters, so
 * "another user's row is never touched" is proven by behaviour, and it emulates
 * the `addon_purchases_one_open_idx` partial unique index.
 */
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      m.touched.add(table)
      let op: 'select' | 'insert' | 'update' = 'select'
      let payload: Row = {}
      const filters: Array<(r: Row) => boolean> = []

      const run = (): { data: Row[] | null; error: { code?: string; message: string } | null } => {
        const rows = (m.db[table] ??= [])
        if (op === 'insert') {
          if (table === 'addon_purchases') {
            const open = rows.some(
              (r) =>
                r.user_id === payload.user_id &&
                r.subscription_id === payload.subscription_id &&
                r.addon_code === payload.addon_code &&
                (r.status === 'pending' || r.status === 'paid'),
            )
            if (m.forceInsertConflict || open) {
              return { data: null, error: { code: '23505', message: 'duplicate key' } }
            }
          }
          const row: Row = {
            id: `p${m.nextId++}`,
            provider_ref: null,
            created_at: new Date().toISOString(),
            ...payload,
          }
          rows.push(row)
          return { data: [row], error: null }
        }
        const matched = rows.filter((r) => filters.every((f) => f(r)))
        if (op === 'update') {
          for (const r of matched) Object.assign(r, payload)
        }
        return { data: matched, error: null }
      }

      const b: Record<string, unknown> = {}
      b.select = () => b
      b.insert = (v: Row) => {
        op = 'insert'
        payload = v
        return b
      }
      b.update = (v: Row) => {
        op = 'update'
        payload = v
        return b
      }
      b.eq = (k: string, v: unknown) => (filters.push((r) => r[k] === v), b)
      b.in = (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), b)
      b.is = (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), b)
      b.order = () => b
      b.limit = () => b
      b.maybeSingle = async () => {
        const res = run()
        return { data: res.data?.[0] ?? null, error: res.error }
      }
      b.single = async () => {
        const res = run()
        const first = res.data?.[0] ?? null
        return { data: first, error: first ? null : (res.error ?? { message: 'no rows' }) }
      }
      b.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject)
      return b
    },
  }),
}))

import { purchaseAddOn } from './addon-purchase-actions'

const PERIOD_END = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString()
const minutesAgo = (n: number) => new Date(Date.now() - n * 60 * 1000).toISOString()

function seed(overrides: { sub?: Row | null; plan?: Row | null } = {}) {
  m.db = {
    billing_subscriptions:
      overrides.sub === null
        ? []
        : [
            {
              id: 's1',
              user_id: 'u1',
              status: 'active',
              current_period_end: PERIOD_END,
              created_at: minutesAgo(1000),
              billing_plans: { code: 'pro' },
              ...overrides.sub,
            },
          ],
    billing_plans:
      overrides.plan === null
        ? []
        : [
            {
              code: 'extra_site_1',
              price_cents: 12300,
              currency: 'TRY',
              interval: 'month',
              product_category: 'addon',
              active: true,
              ...overrides.plan,
            },
          ],
    addon_purchases: [],
    user_addon_entitlements: [],
  }
  m.touched = new Set()
}

const purchases = () => m.db.addon_purchases
const buyer = { fullName: 'Ali Veli', phone: '5320000000', address: 'Istanbul' }

beforeEach(() => {
  vi.clearAllMocks()
  m.user = { id: 'u1', email: 'a@example.com' }
  m.nextId = 1
  m.forceInsertConflict = false
  seed()
  m.createIntent.mockResolvedValue({
    status: 'pending',
    action: 'redirect',
    reference: 'tok_1',
    redirectUrl: 'https://sandbox-cpp.iyzipay.com/pay/tok_1',
  })
})

describe('purchaseAddOn rejections (no payment, no rows)', () => {
  it('rejects an unauthenticated caller before touching the database', async () => {
    m.user = null
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toEqual({ ok: false, error: 'unauthenticated' })
    expect(m.createIntent).not.toHaveBeenCalled()
    expect(m.touched.size).toBe(0)
  })

  it.each(['extra_site_999', 'constructor', '', undefined])('rejects invalid add-on code %s', async (code) => {
    const res = await purchaseAddOn({ addonCode: code as unknown as string })
    expect(res).toEqual({ ok: false, error: 'invalid_addon' })
    expect(m.createIntent).not.toHaveBeenCalled()
    expect(purchases()).toHaveLength(0)
  })

  it('rejects a user without a subscription', async () => {
    seed({ sub: null })
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toEqual({ ok: false, error: 'no_subscription' })
    expect(m.createIntent).not.toHaveBeenCalled()
    expect(purchases()).toHaveLength(0)
  })

  it('never uses a subscription that belongs to another user', async () => {
    seed({ sub: { user_id: 'u2' } })
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toEqual({ ok: false, error: 'no_subscription' })
    expect(purchases()).toHaveLength(0)
  })

  it.each(['trialing', 'past_due'])('rejects a %s subscription', async (status) => {
    seed({ sub: { status } })
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toEqual({ ok: false, error: 'subscription_inactive' })
    expect(m.createIntent).not.toHaveBeenCalled()
    expect(purchases()).toHaveLength(0)
  })

  it.each(['canceled', 'incomplete'])('rejects a %s subscription', async (status) => {
    seed({ sub: { status } })
    const res = await purchaseAddOn({ addonCode: 'extra_site_1' })
    expect(res.ok).toBe(false)
    expect(m.createIntent).not.toHaveBeenCalled()
    expect(purchases()).toHaveLength(0)
  })

  it('rejects an active subscription whose billing period already ended', async () => {
    seed({ sub: { current_period_end: minutesAgo(5) } })
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toEqual({ ok: false, error: 'subscription_inactive' })
    expect(purchases()).toHaveLength(0)
  })

  it('rejects a plan that is not eligible for add-ons', async () => {
    seed({ sub: { billing_plans: { code: 'starter' } } })
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toEqual({ ok: false, error: 'not_eligible' })
    expect(m.createIntent).not.toHaveBeenCalled()
    expect(purchases()).toHaveLength(0)
  })

  it.each([
    ['inactive', { active: false }],
    ['missing', null],
  ])('does not sell an add-on whose billing_plans row is %s', async (_label, plan) => {
    seed({ plan: plan as Row | null })
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toEqual({ ok: false, error: 'not_available' })
    expect(m.createIntent).not.toHaveBeenCalled()
    expect(purchases()).toHaveLength(0)
  })

  it('does not sell in a currency other than TRY', async () => {
    seed({ plan: { currency: 'USD' } })
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toEqual({ ok: false, error: 'not_available' })
    expect(purchases()).toHaveLength(0)
  })
})

describe('purchaseAddOn happy path', () => {
  it('creates the pending purchase from server data and opens an iyzico intent with the same amount', async () => {
    const res = await purchaseAddOn({ addonCode: 'extra_site_1', buyer })

    expect(res).toEqual({ ok: true, purchaseId: 'p1', redirectUrl: 'https://sandbox-cpp.iyzipay.com/pay/tok_1' })
    expect(purchases()).toHaveLength(1)
    expect(purchases()[0]).toMatchObject({
      user_id: 'u1',
      subscription_id: 's1',
      addon_code: 'extra_site_1',
      amount: 12300,
      currency: 'TRY',
      period_end_snapshot: PERIOD_END,
      status: 'pending',
      provider: 'iyzico',
      provider_ref: 'tok_1',
    })
    expect(m.createIntent).toHaveBeenCalledTimes(1)
    expect(m.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'addon_p1',
        amountCents: 12300,
        currency: 'TRY',
        customerEmail: 'a@example.com',
      }),
    )
  })

  it('grants nothing and never moves past pending', async () => {
    await purchaseAddOn({ addonCode: 'extra_site_1' })
    expect(purchases()[0].status).toBe('pending')
    expect(m.db.user_addon_entitlements).toHaveLength(0)
    expect(m.touched.has('user_addon_entitlements')).toBe(false)
  })

  it('ignores client-supplied price, currency, capacity, plan, amount and purchase id', async () => {
    m.db.addon_purchases.push({
      id: 'p-other',
      user_id: 'u2',
      subscription_id: 's2',
      addon_code: 'extra_site_1',
      status: 'pending',
      provider_ref: 'tok_other',
      created_at: minutesAgo(5),
      amount: 9900,
      currency: 'TRY',
    })
    const hostile = {
      addonCode: 'extra_site_1',
      priceCents: 1,
      amount: 1,
      currency: 'USD',
      capacity: 999,
      planCode: 'pro',
      subscriptionId: 's-evil',
      purchaseId: 'p-other',
    } as unknown as Parameters<typeof purchaseAddOn>[0]

    const res = await purchaseAddOn(hostile)

    expect(res.ok).toBe(true)
    const mine = purchases().find((r) => r.user_id === 'u1')!
    expect(mine).toMatchObject({ amount: 12300, currency: 'TRY', subscription_id: 's1' })
    expect(mine.id).not.toBe('p-other')
    expect(m.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 12300, currency: 'TRY', orderId: `addon_${mine.id}` }),
    )
    // The other user's purchase is untouched.
    expect(purchases().find((r) => r.id === 'p-other')).toMatchObject({
      status: 'pending',
      provider_ref: 'tok_other',
    })
  })

  it('does not let another user\'s open purchase block or be reused by this user', async () => {
    m.db.addon_purchases.push({
      id: 'p-other',
      user_id: 'u2',
      subscription_id: 's2',
      addon_code: 'extra_site_1',
      status: 'pending',
      provider_ref: null,
      created_at: minutesAgo(10),
      amount: 9900,
      currency: 'TRY',
    })
    const res = await purchaseAddOn({ addonCode: 'extra_site_1' })
    expect(res.ok).toBe(true)
    expect(purchases().find((r) => r.id === 'p-other')).toMatchObject({ status: 'pending', provider_ref: null })
  })
})

describe('purchaseAddOn PSP failures', () => {
  it('marks the purchase failed and creates no entitlement when iyzico throws', async () => {
    m.createIntent.mockRejectedValue(new Error('iyzico_error: boom'))
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toEqual({
      ok: false,
      error: 'payment_init_failed',
      detail: 'iyzico_error: boom',
    })
    expect(purchases()).toHaveLength(1)
    expect(purchases()[0]).toMatchObject({ status: 'failed', provider_ref: null })
    expect(m.touched.has('user_addon_entitlements')).toBe(false)
  })

  it.each([
    ['failed status', { status: 'failed', action: 'none', reference: 'x' }],
    ['no redirect url', { status: 'pending', action: 'redirect', reference: 'x' }],
    ['synchronous completion', { status: 'paid', action: 'completed', reference: 'x' }],
  ])('fails the purchase on %s', async (_label, intent) => {
    m.createIntent.mockResolvedValue(intent)
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toMatchObject({ ok: false, error: 'payment_init_failed' })
    expect(purchases()[0]).toMatchObject({ status: 'failed', provider_ref: null })
    expect(m.touched.has('user_addon_entitlements')).toBe(false)
  })

  it('allows a fresh attempt after a failed one', async () => {
    m.createIntent.mockRejectedValueOnce(new Error('psp down'))
    await purchaseAddOn({ addonCode: 'extra_site_1' })
    const retry = await purchaseAddOn({ addonCode: 'extra_site_1' })
    expect(retry.ok).toBe(true)
    expect(purchases().map((r) => r.status)).toEqual(['failed', 'pending'])
  })
})

describe('purchaseAddOn double-click protection', () => {
  it('a second click while the first payment is open starts no second payment', async () => {
    expect((await purchaseAddOn({ addonCode: 'extra_site_1' })).ok).toBe(true)
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toEqual({ ok: false, error: 'purchase_in_progress' })
    expect(m.createIntent).toHaveBeenCalledTimes(1)
    expect(purchases()).toHaveLength(1)
  })

  it('a paid purchase that is not granted yet also blocks a new payment', async () => {
    m.db.addon_purchases.push({
      id: 'p-paid',
      user_id: 'u1',
      subscription_id: 's1',
      addon_code: 'extra_site_1',
      status: 'paid',
      provider_ref: 'tok_paid',
      created_at: minutesAgo(3),
      amount: 12300,
      currency: 'TRY',
    })
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toEqual({ ok: false, error: 'purchase_in_progress' })
    expect(m.createIntent).not.toHaveBeenCalled()
  })

  it('a granted purchase does not block buying the same add-on again', async () => {
    m.db.addon_purchases.push({
      id: 'p-done',
      user_id: 'u1',
      subscription_id: 's1',
      addon_code: 'extra_site_1',
      status: 'granted',
      provider_ref: 'tok_done',
      created_at: minutesAgo(500),
      amount: 12300,
      currency: 'TRY',
    })
    expect((await purchaseAddOn({ addonCode: 'extra_site_1' })).ok).toBe(true)
  })

  it('a concurrent insert caught by the unique index is reported as in progress', async () => {
    m.forceInsertConflict = true
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toEqual({ ok: false, error: 'purchase_in_progress' })
    expect(m.createIntent).not.toHaveBeenCalled()
  })

  it('reuses an abandoned pending purchase that never got a payment token', async () => {
    m.db.addon_purchases.push({
      id: 'p-abandoned',
      user_id: 'u1',
      subscription_id: 's1',
      addon_code: 'extra_site_1',
      status: 'pending',
      provider_ref: null,
      created_at: minutesAgo(5),
      amount: 9900,
      currency: 'TRY',
      period_end_snapshot: minutesAgo(-60),
    })
    const res = await purchaseAddOn({ addonCode: 'extra_site_1' })
    expect(res).toMatchObject({ ok: true, purchaseId: 'p-abandoned' })
    expect(purchases()).toHaveLength(1)
    expect(purchases()[0]).toMatchObject({
      amount: 12300,
      period_end_snapshot: PERIOD_END,
      provider_ref: 'tok_1',
      status: 'pending',
    })
    expect(m.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'addon_p-abandoned', amountCents: 12300 }),
    )
  })

  it('does not reuse an unlinked purchase that is still within the in-flight grace period', async () => {
    m.db.addon_purchases.push({
      id: 'p-flying',
      user_id: 'u1',
      subscription_id: 's1',
      addon_code: 'extra_site_1',
      status: 'pending',
      provider_ref: null,
      created_at: new Date().toISOString(),
      amount: 12300,
      currency: 'TRY',
    })
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toEqual({ ok: false, error: 'purchase_in_progress' })
    expect(m.createIntent).not.toHaveBeenCalled()
  })

  it('does not reuse a pending purchase that already has a live payment token', async () => {
    m.db.addon_purchases.push({
      id: 'p-live',
      user_id: 'u1',
      subscription_id: 's1',
      addon_code: 'extra_site_1',
      status: 'pending',
      provider_ref: 'tok_live',
      created_at: minutesAgo(10),
      amount: 12300,
      currency: 'TRY',
    })
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toEqual({ ok: false, error: 'purchase_in_progress' })
    expect(purchases()[0]).toMatchObject({ status: 'pending', provider_ref: 'tok_live' })
  })

  it('expires a pending purchase whose payment window has passed and starts a new one', async () => {
    m.db.addon_purchases.push({
      id: 'p-stale',
      user_id: 'u1',
      subscription_id: 's1',
      addon_code: 'extra_site_1',
      status: 'pending',
      provider_ref: 'tok_stale',
      created_at: minutesAgo(45),
      amount: 12300,
      currency: 'TRY',
    })
    const res = await purchaseAddOn({ addonCode: 'extra_site_1' })
    expect(res.ok).toBe(true)
    expect(purchases().find((r) => r.id === 'p-stale')?.status).toBe('failed')
    expect(purchases().filter((r) => r.status === 'pending')).toHaveLength(1)
  })

  it('loses gracefully when a sibling request links its token first', async () => {
    m.createIntent.mockImplementation(async () => {
      purchases()[0].provider_ref = 'tok_winner'
      return {
        status: 'pending',
        action: 'redirect',
        reference: 'tok_loser',
        redirectUrl: 'https://sandbox-cpp.iyzipay.com/pay/tok_loser',
      }
    })
    expect(await purchaseAddOn({ addonCode: 'extra_site_1' })).toEqual({ ok: false, error: 'purchase_in_progress' })
    expect(purchases()[0]).toMatchObject({ status: 'pending', provider_ref: 'tok_winner' })
  })
})
