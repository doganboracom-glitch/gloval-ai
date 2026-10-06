import { describe, expect, it } from 'vitest'
import { computeDomainQuote, getFixedRates, type FxRate } from './calc'
import { priceAvailabilityRows, resolveOrderPricing, type PricingContext } from './order'

const NOW = new Date('2026-03-10T12:00:00.000Z')
const FAR_FUTURE = new Date('2030-01-01T00:00:00.000Z')

const context: PricingContext = { vatBps: 2000, rates: getFixedRates(NOW) }

describe('fixed manual USD/TRY rate', () => {
  it('converts 10 USD to 500 TL cost at 1 USD = 50 TL', () => {
    const r = resolveOrderPricing({ price: { registerCents: 1000, currency: 'USD' }, periodYears: 1, context, now: NOW })
    expect(r.ok && r.snapshot.costTryMinor).toBe(50_000)
  })

  it('adds a 50% margin on the cost, then 20% VAT on the margin-inclusive amount', () => {
    const r = resolveOrderPricing({ price: { registerCents: 1000, currency: 'USD' }, periodYears: 1, context, now: NOW })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.netTryMinor).toBe(75_000)
    expect(r.snapshot.vatTryMinor).toBe(15_000)
    expect(r.snapshot.grossTryMinor).toBe(90_000)
  })

  it('does not apply any conversion to TRY prices', () => {
    const q = computeDomainQuote({ costMinor: 10_000, currency: 'TRY', periodYears: 1, fx: undefined, vatBps: 2000, now: NOW })
    expect(q.ok && q.snapshot.costTryMinor).toBe(10_000)
    expect(q.ok && q.snapshot.fxRateMicros).toBe(1_000_000)
  })

  it('is not rejected by the live-rate age check, however old the clock is', () => {
    const r = resolveOrderPricing({
      price: { registerCents: 1000, currency: 'USD' },
      periodYears: 1,
      context,
      now: FAR_FUTURE,
    })
    expect(r.ok).toBe(true)
  })

  it('still rejects an equally old live rate as FX_STALE', () => {
    const live: FxRate = { ...context.rates.USD, kind: 'live', source: 'fixture' }
    const q = computeDomainQuote({ costMinor: 1000, currency: 'USD', periodYears: 1, fx: live, vatBps: 2000, now: FAR_FUTURE })
    expect(q).toEqual({ ok: false, reason: 'FX_STALE' })
  })

  it('labels the rate source as fixed_manual_rate in the snapshot', () => {
    const r = resolveOrderPricing({ price: { registerCents: 1000, currency: 'USD' }, periodYears: 1, context, now: NOW })
    expect(r.ok && r.snapshot.fxSource).toBe('fixed_manual_rate')
  })

  it('has no rate for EUR and fails closed instead of reusing the USD rate', () => {
    const r = resolveOrderPricing({ price: { registerCents: 1000, currency: 'EUR' }, periodYears: 1, context, now: NOW })
    expect(r).toEqual({ ok: false, reason: 'FX_MISSING' })
    const [row] = priceAvailabilityRows(
      [{ domain: 'a.com', tld: 'com', status: 'available', price: { registerCents: 1000, currency: 'EUR' } }],
      context,
      NOW,
    )
    expect(row.quote).toBeNull()
  })

  it('cannot be influenced by client-supplied rate or price values', () => {
    const baseline = resolveOrderPricing({ price: { registerCents: 1000, currency: 'USD' }, periodYears: 1, context, now: NOW })
    const call = resolveOrderPricing as unknown as (input: unknown) => ReturnType<typeof resolveOrderPricing>
    const tampered = call({
      price: { registerCents: 1000, currency: 'USD' },
      periodYears: 1,
      context,
      now: NOW,
      fxRateMicros: 1,
      rateMicros: 1,
      vatBps: 0,
      priceCents: 1,
    })
    expect(tampered).toEqual(baseline)
  })
})
