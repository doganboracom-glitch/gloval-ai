import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixedRates } from '../pricing/calc'

type Op = { table: string; op: 'insert' | 'update' | 'upsert'; payload: Record<string, unknown> }

const mocks = vi.hoisted(() => ({
  ops: [] as { table: string; op: 'insert' | 'update' | 'upsert'; payload: Record<string, unknown> }[],
  getUser: vi.fn(),
  createIntent: vi.fn(),
  checkAvailability: vi.fn(),
  registerDomain: vi.fn(),
  finalizeDomainOrder: vi.fn(),
  loadPricingContext: vi.fn(),
  getDomainEntitlement: vi.fn(),
  listDomainsForUser: vi.fn(),
  persistedPriceOverride: null as number | null,
}))

function makeBuilder(table: string) {
  const record = (op: Op['op']) => (payload: Record<string, unknown>) => {
    mocks.ops.push({ table, op, payload })
    return builder
  }
  const builder: Record<string, unknown> = {
    insert: record('insert'),
    update: record('update'),
    upsert: record('upsert'),
    select: () => builder,
    eq: () => builder,
    single: async () => {
      const inserted = [...mocks.ops].reverse().find((op) => op.table === table && op.op === 'insert')?.payload
      return {
        data: {
          id: 'order-1',
          price_cents: mocks.persistedPriceOverride ?? inserted?.price_cents,
          currency: inserted?.currency,
          price_snapshot: inserted?.price_snapshot,
        },
        error: null,
      }
    },
    then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
  }
  return builder
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/platform-buyer', () => ({
  resolvePlatformBuyerPublicConfig: async () => ({ buyer: { fullName: 'Ali Veli' } }),
  checkPlatformBuyerProfile: async () => 'complete',
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeBuilder(table) }),
}))
vi.mock('@/lib/payments', () => ({
  getPlatformPaymentProvider: () => ({ createIntent: mocks.createIntent }),
  getPlatformPaymentProviderId: () => 'iyzico',
}))
vi.mock('@/lib/billing', () => ({
  getMyCurrentPlan: async () => ({}),
  getMySubscription: async () => ({}),
}))
vi.mock('@/lib/custom-domains/access', () => ({ getDomainEntitlement: mocks.getDomainEntitlement }))
vi.mock('@/lib/custom-domains/service', () => ({ listDomainsForUser: mocks.listDomainsForUser }))
vi.mock('@/lib/custom-domains/registrar/provider', () => ({
  getDomainRegistrarProvider: () => ({
    checkAvailability: mocks.checkAvailability,
    registerDomain: mocks.registerDomain,
  }),
  isLiveDomainRegistrar: () => true,
}))
vi.mock('@/lib/custom-domains/registrar/service', () => ({
  finalizeDomainOrder: mocks.finalizeDomainOrder,
  searchDomainAvailability: vi.fn(),
  parsePurchaseDomain: (d: string) => ({ domain: d, tld: d.split('.').slice(1).join('.') }),
}))
vi.mock('@/lib/custom-domains/pricing/context', () => ({ loadPricingContext: mocks.loadPricingContext }))

import { startMyDomainPurchase } from './actions'

const contact = {} as Parameters<typeof startMyDomainPurchase>[2]
const consents = { preInfo: true, distance: true, withdrawal: true }
const quoteForYears = (years: number) => ({ grossMinor: 117_000 * (years >= 1 && years <= 10 ? years : 1), currency: 'TRY' })
const startPurchase = (years = 1, expectedQuote = quoteForYears(years)) =>
  startMyDomainPurchase('example.com', years, contact, consents, undefined, expectedQuote)
const tableOps = (table: string, op?: Op['op']) =>
  mocks.ops.filter((o) => o.table === table && (!op || o.op === op))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.ops.length = 0
  mocks.persistedPriceOverride = null
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'u@example.com' } } })
  mocks.getDomainEntitlement.mockReturnValue({ allowed: true, maxDomains: 5 })
  mocks.listDomainsForUser.mockResolvedValue([])
  mocks.loadPricingContext.mockImplementation(async () => ({ vatBps: 2000, rates: getFixedRates(new Date()) }))
  // 10.00 USD/year at the registrar.
  mocks.checkAvailability.mockResolvedValue([
    { domain: 'example.com', status: 'available', price: { registerCents: 1000, currency: 'USD' } },
  ])
  mocks.createIntent.mockResolvedValue({
    status: 'pending',
    action: 'redirect',
    reference: 'pay-ref-1',
    redirectUrl: 'https://sandbox-pay.example/checkout',
  })
})

describe('startMyDomainPurchase - order creation before payment', () => {
  it('persists and charges the exact snapshot gross after the shared price increase (10 USD at 50 TRY/USD, +50% margin, +20% VAT)', async () => {
    const result = await startPurchase(2)

    expect(result).toEqual({ ok: true, orderId: 'order-1', redirectUrl: 'https://sandbox-pay.example/checkout' })

    const [insert] = tableOps('domain_orders', 'insert')
    const snapshot = insert.payload.price_snapshot as Record<string, number | string | null>

    // 10.00 USD * 50 = 500.00 TRY cost/year; 50% margin and 20% VAT, then the shared price increase = 1,170.00 TRY/year.
    expect(snapshot).toMatchObject({
      version: 2,
      periodYears: 2,
      providerCostMinor: 1000,
      providerCurrency: 'USD',
      fxRateMicros: 50_000_000,
      fxSource: 'fixed_manual_rate',
      costTryMinor: 100_000,
      marginBps: 5000,
      netTryMinor: 195_000,
      vatBps: 2000,
      vatTryMinor: 39_000,
      grossTryMinor: 234_000,
      unitGrossTryMinor: 117_000,
      renewal: null,
    })
    expect((snapshot.netTryMinor as number) + (snapshot.vatTryMinor as number)).toBe(snapshot.grossTryMinor)

    expect(insert.payload).toMatchObject({
      user_id: 'user-1',
      domain: 'example.com',
      period_years: 2,
      status: 'pending_payment',
      price_cents: snapshot.grossTryMinor,
      currency: 'TRY',
    })

    expect(mocks.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'domreg_order-1', amountCents: snapshot.grossTryMinor, currency: 'TRY' }),
    )
    const [tx] = tableOps('billing_transactions', 'upsert')
    expect(tx.payload).toMatchObject({
      amount_cents: snapshot.grossTryMinor,
      currency: 'TRY',
      status: 'pending',
      idempotency_key: 'domreg_order-1',
      consent_pre_info: true,
      consent_distance: true,
      consent_withdrawal: true,
    })
    expect(typeof tx.payload.consent_version).toBe('string')
    expect(typeof tx.payload.consented_at).toBe('string')
  })

  it('never registers the domain before payment is confirmed (redirect flow)', async () => {
    await startPurchase(1)

    expect(mocks.registerDomain).not.toHaveBeenCalled()
    expect(mocks.finalizeDomainOrder).not.toHaveBeenCalled()
    const statuses = tableOps('domain_orders', 'update').map((o) => o.payload.status)
    expect(statuses).not.toContain('payment_verified')
    expect(statuses).not.toContain('active')
  })

  it('only finalizes immediately when the provider reports the charge completed synchronously', async () => {
    mocks.createIntent.mockResolvedValue({ status: 'paid', action: 'completed', reference: 'sync-ref' })

    const result = await startPurchase(1)

    expect(result).toEqual({ ok: true, orderId: 'order-1' })
    expect(mocks.finalizeDomainOrder).toHaveBeenCalledTimes(1)
    expect(mocks.finalizeDomainOrder).toHaveBeenCalledWith('order-1')
  })
})

describe('startMyDomainPurchase - guards run before any write or payment', () => {
  it('rejects an unauthenticated caller before touching the registrar, DB or PSP', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })

    await expect(startMyDomainPurchase('example.com', 1, contact, { preInfo: true, distance: true, withdrawal: true })).rejects.toThrow('UNAUTHENTICATED')

    expect(mocks.checkAvailability).not.toHaveBeenCalled()
    expect(mocks.ops).toHaveLength(0)
    expect(mocks.createIntent).not.toHaveBeenCalled()
  })

  it('does not gate purchase on the plan connect-domain entitlement or limit', async () => {
    mocks.getDomainEntitlement.mockReturnValue({ allowed: false, maxDomains: 0 })
    mocks.listDomainsForUser.mockResolvedValue([{ domain: 'other.com' }])

    const result = await startPurchase(1)
    expect(result).toMatchObject({ ok: true })
  })

  it('returns ALREADY_OWNED without any write or payment', async () => {
    mocks.listDomainsForUser.mockResolvedValue([{ domain: 'example.com' }])
    expect(await startPurchase(1)).toEqual({ ok: false, error: 'ALREADY_OWNED' })

    expect(mocks.ops).toHaveLength(0)
    expect(mocks.createIntent).not.toHaveBeenCalled()
  })

  it('blocks a stale displayed quote before creating an order or payment', async () => {
    expect(await startPurchase(1, { grossMinor: 116_999, currency: 'TRY' })).toEqual({
      ok: false,
      error: 'PRICING_UNAVAILABLE',
    })
    expect(mocks.ops).toHaveLength(0)
    expect(mocks.createIntent).not.toHaveBeenCalled()
  })

  it.each([
    ['taken at re-check', [{ domain: 'example.com', status: 'unavailable', price: null }]],
    ['available but unpriced', [{ domain: 'example.com', status: 'available', price: null }]],
    ['unknown status', [{ domain: 'example.com', status: 'unknown', price: null }]],
  ])('returns UNAVAILABLE when the domain is %s', async (_label, rows) => {
    mocks.checkAvailability.mockResolvedValue(rows)

    expect(await startPurchase(1)).toEqual({ ok: false, error: 'UNAVAILABLE' })
    expect(mocks.ops).toHaveLength(0)
    expect(mocks.createIntent).not.toHaveBeenCalled()
  })

  it('returns FAILED without any write when the availability re-check throws', async () => {
    mocks.checkAvailability.mockRejectedValue(new Error('registrar down'))

    expect(await startPurchase(1)).toEqual({ ok: false, error: 'FAILED' })
    expect(mocks.ops).toHaveLength(0)
    expect(mocks.createIntent).not.toHaveBeenCalled()
  })

  it('normalises an invalid period to 1 year instead of trusting the client', async () => {
    await startPurchase(99)

    const [insert] = tableOps('domain_orders', 'insert')
    expect(insert.payload.period_years).toBe(1)
    expect((insert.payload.price_snapshot as { periodYears: number }).periodYears).toBe(1)
  })
})

describe('startMyDomainPurchase - payment initialisation failures keep records consistent', () => {
  it('blocks payment and fails the order when the persisted amount differs from the quote', async () => {
    mocks.persistedPriceOverride = 117_001

    expect(await startPurchase(1)).toEqual({ ok: false, error: 'PRICING_UNAVAILABLE' })
    expect(tableOps('domain_orders', 'insert')).toHaveLength(1)
    expect(tableOps('domain_orders', 'update').map((op) => op.payload)).toEqual([
      { status: 'failed', error_message: 'price_mismatch' },
    ])
    expect(mocks.createIntent).not.toHaveBeenCalled()
  })

  it('marks the order failed and writes no billing transaction when createIntent throws', async () => {
    mocks.createIntent.mockRejectedValue(new Error('psp unreachable'))

    expect(await startPurchase(1)).toEqual({ ok: false, error: 'FAILED' })

    expect(tableOps('domain_orders', 'insert')).toHaveLength(1)
    expect(tableOps('domain_orders', 'update').map((o) => o.payload)).toEqual([
      { status: 'failed', error_message: 'payment_init_failed' },
    ])
    expect(tableOps('billing_transactions')).toHaveLength(0)
    expect(mocks.finalizeDomainOrder).not.toHaveBeenCalled()
  })

  it('marks the order failed and writes no billing transaction when the intent comes back failed', async () => {
    mocks.createIntent.mockResolvedValue({ status: 'failed', action: 'none', reference: 'x' })

    expect(await startPurchase(1)).toEqual({ ok: false, error: 'FAILED' })

    expect(tableOps('domain_orders', 'update').map((o) => o.payload.status)).toEqual(['failed'])
    expect(tableOps('billing_transactions')).toHaveLength(0)
    expect(mocks.finalizeDomainOrder).not.toHaveBeenCalled()
  })
})
