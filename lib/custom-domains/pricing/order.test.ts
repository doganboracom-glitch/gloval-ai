import { describe, expect, it } from 'vitest'
import type { FxRate } from './calc'
import { priceAvailabilityRows, resolveOrderPricing, type PricingContext } from './order'

const NOW = new Date('2026-03-10T12:00:00.000Z')

function ctx(over: Partial<PricingContext> = {}, rateMicros = 38_500_000): PricingContext {
  const usd: FxRate = {
    currency: 'USD',
    rateMicros,
    source: 'fixture',
    fetchedAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
  }
  return { vatBps: 2000, rates: { USD: usd }, ...over }
}

describe('resolveOrderPricing', () => {
  it('derives the charged amount and persisted columns from the same snapshot', () => {
    const r = resolveOrderPricing({
      price: { registerCents: 1000, currency: 'usd' },
      periodYears: 2,
      context: ctx(),
      now: NOW,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.paymentAmount).toEqual({ amountCents: 138_600, currency: 'TRY' })
    expect(r.orderFields.price_cents).toBe(r.paymentAmount.amountCents)
    expect(r.orderFields.currency).toBe('TRY')
    expect(r.orderFields.price_snapshot).toBe(r.snapshot)
  })

  it('has no parameter through which a client could supply price, rate, margin or VAT', () => {
    const r = resolveOrderPricing({
      price: { registerCents: 1000, currency: 'USD' },
      periodYears: 1,
      context: ctx(),
      now: NOW,
      // @ts-expect-error unknown keys are not part of the API
      clientPrice: 1,
      marginBps: 0,
      vatBps: 0,
      fxRateMicros: 1,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.grossTryMinor).toBe(69_300)
    expect(r.snapshot.marginBps).toBe(5000)
    expect(r.snapshot.vatBps).toBe(2000)
    expect(r.snapshot.fxRateMicros).toBe(38_500_000)
  })

  it('fails closed with no order or payment fields when VAT is missing', () => {
    const r = resolveOrderPricing({
      price: { registerCents: 1000, currency: 'USD' },
      periodYears: 1,
      context: ctx({ vatBps: null }),
      now: NOW,
    })
    expect(r).toEqual({ ok: false, reason: 'VAT_MISSING' })
    expect(r).not.toHaveProperty('orderFields')
    expect(r).not.toHaveProperty('paymentAmount')
  })

  it('fails closed when the rate is missing, stale or the currency is unsupported', () => {
    const base = { periodYears: 1, now: NOW }
    expect(
      resolveOrderPricing({ ...base, price: { registerCents: 1000, currency: 'USD' }, context: ctx({ rates: {} }) }),
    ).toEqual({ ok: false, reason: 'FX_MISSING' })

    const stale = ctx()
    stale.rates.USD.fetchedAt = new Date(NOW.getTime() - 48 * 3_600_000).toISOString()
    expect(resolveOrderPricing({ ...base, price: { registerCents: 1000, currency: 'USD' }, context: stale })).toEqual({
      ok: false,
      reason: 'FX_STALE',
    })

    expect(resolveOrderPricing({ ...base, price: { registerCents: 1000, currency: 'JPY' }, context: ctx() })).toEqual({
      ok: false,
      reason: 'FX_MISSING',
    })
    expect(resolveOrderPricing({ ...base, price: { registerCents: 1000, currency: '??' }, context: ctx() })).toEqual({
      ok: false,
      reason: 'INVALID_CURRENCY',
    })
  })

  it('keeps an already-computed order amount when the rate later changes', () => {
    const price = { registerCents: 1000, currency: 'USD' }
    const before = resolveOrderPricing({ price, periodYears: 1, context: ctx(), now: NOW })
    const after = resolveOrderPricing({ price, periodYears: 1, context: ctx({}, 45_000_000), now: NOW })
    expect(before.ok && after.ok).toBe(true)
    if (!before.ok || !after.ok) return
    // The persisted snapshot/amount of the first order is a plain value copy.
    expect(before.paymentAmount.amountCents).toBe(69_300)
    expect(before.orderFields.price_snapshot.fxRateMicros).toBe(38_500_000)
    expect(after.paymentAmount.amountCents).not.toBe(before.paymentAmount.amountCents)
  })
})

describe('priceAvailabilityRows', () => {
  it('prices available rows per year and leaves unpriceable rows without a quote', () => {
    const rows = priceAvailabilityRows(
      [
        { domain: 'a.com', tld: 'com', status: 'available', price: { registerCents: 1000, currency: 'USD' } },
        { domain: 'b.com', tld: 'com', status: 'unavailable', price: null },
        { domain: 'c.xyz', tld: 'xyz', status: 'available', price: { registerCents: 500, currency: 'JPY' } },
      ],
      ctx(),
      NOW,
    )
    expect(rows[0].quote).toEqual({ currency: 'TRY', netMinor: 57_750, vatMinor: 11_550, grossMinor: 69_300, vatBps: 2000 })
    expect(rows[1].quote).toBeNull()
    expect(rows[2].quote).toBeNull()
  })

  it('never exposes provider cost or currency', () => {
    const [row] = priceAvailabilityRows(
      [{ domain: 'a.com', tld: 'com', status: 'available', price: { registerCents: 1000, currency: 'USD' } }],
      ctx(),
      NOW,
    )
    const json = JSON.stringify(row)
    expect(json).not.toContain('USD')
    expect(json).not.toContain('registerCents')
    expect(json).not.toContain('providerCost')
  })

  it('returns no quotes at all when VAT is not configured', () => {
    const rows = priceAvailabilityRows(
      [{ domain: 'a.com', tld: 'com', status: 'available', price: { registerCents: 1000, currency: 'USD' } }],
      ctx({ vatBps: null }),
      NOW,
    )
    expect(rows[0].quote).toBeNull()
  })
})
