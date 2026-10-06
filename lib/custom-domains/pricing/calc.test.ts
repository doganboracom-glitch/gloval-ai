import { describe, expect, it } from 'vitest'
import {
  MARGIN_BPS,
  MAX_RATE_AGE_MS,
  computeDomainQuote,
  parseVatPercentToBps,
  roundDiv,
  toQuoteView,
  type FxRate,
} from './calc'

const NOW = new Date('2026-03-10T12:00:00.000Z')
const HOUR = 60 * 60 * 1000

function usdRate(overrides: Partial<FxRate> = {}): FxRate {
  return {
    currency: 'USD',
    rateMicros: 38_500_000, // 1 USD = 38.50 TRY
    source: 'fixture',
    fetchedAt: new Date(NOW.getTime() - HOUR).toISOString(),
    ...overrides,
  }
}

function quote(over: Partial<Parameters<typeof computeDomainQuote>[0]> = {}) {
  return computeDomainQuote({
    costMinor: 1000,
    currency: 'USD',
    periodYears: 1,
    fx: usdRate(),
    vatBps: 2000,
    now: NOW,
    ...over,
  })
}

describe('roundDiv', () => {
  it('rounds half up', () => {
    expect(roundDiv(BigInt(1), BigInt(2))).toBe(BigInt(1))
    expect(roundDiv(BigInt(1), BigInt(3))).toBe(BigInt(0))
    expect(roundDiv(BigInt(5), BigInt(10))).toBe(BigInt(1))
    expect(roundDiv(BigInt(4), BigInt(10))).toBe(BigInt(0))
  })
})

describe('parseVatPercentToBps', () => {
  it('parses sane percentages', () => {
    expect(parseVatPercentToBps('20')).toBe(2000)
    expect(parseVatPercentToBps(' 18.5 ')).toBe(1850)
    expect(parseVatPercentToBps('0')).toBe(0)
    expect(parseVatPercentToBps('100')).toBe(10000)
  })
  it('rejects missing or malformed values', () => {
    for (const bad of [undefined, null, '', '   ', 'abc', '-1', '101', '20.123', '20%', '1e2', '20,5']) {
      expect(parseVatPercentToBps(bad as string | undefined | null)).toBeNull()
    }
  })
})

describe('computeDomainQuote', () => {
  it('handles TRY cost with an identity rate', () => {
    const r = quote({ costMinor: 10_000, currency: 'TRY', fx: undefined })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 100.00 TRY cost -> +50% = 150.00 net -> 20% VAT = 30.00 -> 180.00 gross
    expect(r.snapshot.costTryMinor).toBe(10_000)
    expect(r.snapshot.netTryMinor).toBe(15_000)
    expect(r.snapshot.vatTryMinor).toBe(3_000)
    expect(r.snapshot.grossTryMinor).toBe(18_000)
    expect(r.snapshot.fxSource).toBe('identity')
    expect(r.snapshot.fxRateMicros).toBe(1_000_000)
  })

  it('converts foreign cost with a fixed rate, adds 50% margin and VAT', () => {
    const r = quote()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 10.00 USD * 38.50 = 385.00 TRY cost; +50% = 577.50 net; 20% VAT = 115.50; gross 693.00
    expect(r.snapshot.costTryMinor).toBe(38_500)
    expect(r.snapshot.marginBps).toBe(MARGIN_BPS)
    expect(r.snapshot.netTryMinor).toBe(57_750)
    expect(r.snapshot.vatTryMinor).toBe(11_550)
    expect(r.snapshot.grossTryMinor).toBe(69_300)
    expect(r.snapshot.netTryMinor + r.snapshot.vatTryMinor).toBe(r.snapshot.grossTryMinor)
    expect(r.snapshot.providerCostMinor).toBe(1000)
    expect(r.snapshot.providerCurrency).toBe('USD')
    expect(r.snapshot.fxSource).toBe('fixture')
  })

  it('normalises the currency code case and whitespace', () => {
    const r = quote({ currency: ' usd ' })
    expect(r.ok).toBe(true)
  })

  it('scales per-year price by the period', () => {
    const r = quote({ periodYears: 3 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.unitGrossTryMinor).toBe(69_300)
    expect(r.snapshot.grossTryMinor).toBe(207_900)
    expect(r.snapshot.netTryMinor).toBe(57_750 * 3)
    expect(r.snapshot.vatTryMinor).toBe(11_550 * 3)
  })

  it('supports a zero VAT rate', () => {
    const r = quote({ vatBps: 0 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.vatTryMinor).toBe(0)
    expect(r.snapshot.grossTryMinor).toBe(r.snapshot.netTryMinor)
  })

  describe('kuruş rounding', () => {
    it('rounds the margin half up (1.5 -> 2)', () => {
      const r = quote({ costMinor: 3, currency: 'TRY', fx: undefined, vatBps: 0 })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.snapshot.costTryMinor).toBe(3)
      expect(r.snapshot.netTryMinor).toBe(5) // 3 + round(1.5) = 5
    })

    it('rounds VAT half up and keeps net + VAT = gross', () => {
      const r = quote({ costMinor: 3, currency: 'TRY', fx: undefined, vatBps: 2000 })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      // net 5, VAT 20% = 1.00 -> 1, gross 6
      expect(r.snapshot.vatTryMinor).toBe(1)
      expect(r.snapshot.grossTryMinor).toBe(6)
    })

    it('rounds the FX conversion half up (0.5 kuruş -> 1)', () => {
      const r = quote({ costMinor: 1, fx: usdRate({ rateMicros: 500_000 }), vatBps: 0 })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.snapshot.costTryMinor).toBe(1)
    })

    it('refuses a sale that would round down to zero', () => {
      const r = quote({ costMinor: 1, fx: usdRate({ rateMicros: 499_999 }) })
      expect(r).toEqual({ ok: false, reason: 'INVALID_COST' })
    })

    it('stays exact for large amounts without float drift', () => {
      const r = quote({ costMinor: 9_999_999, fx: usdRate({ rateMicros: 38_123_457 }) })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const expectedCost = Number((BigInt(9_999_999) * BigInt(38_123_457) * BigInt(2) + BigInt(1_000_000)) / BigInt(2_000_000))
      expect(r.snapshot.costTryMinor).toBe(expectedCost)
    })
  })

  describe('FX failures (fail closed)', () => {
    it('missing rate', () => {
      expect(quote({ fx: undefined })).toEqual({ ok: false, reason: 'FX_MISSING' })
      expect(quote({ fx: null })).toEqual({ ok: false, reason: 'FX_MISSING' })
    })
    it('rate for a different currency', () => {
      expect(quote({ fx: usdRate({ currency: 'EUR' }) })).toEqual({ ok: false, reason: 'FX_MISSING' })
    })
    it('non-positive or non-integer rate', () => {
      for (const rateMicros of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60]) {
        expect(quote({ fx: usdRate({ rateMicros }) })).toEqual({ ok: false, reason: 'FX_INVALID' })
      }
    })
    it('missing source', () => {
      expect(quote({ fx: usdRate({ source: '' }) })).toEqual({ ok: false, reason: 'FX_INVALID' })
    })
    it('unparseable timestamp', () => {
      expect(quote({ fx: usdRate({ fetchedAt: 'yesterday-ish' }) })).toEqual({ ok: false, reason: 'FX_INVALID' })
      expect(quote({ fx: usdRate({ fetchedAt: '' }) })).toEqual({ ok: false, reason: 'FX_INVALID' })
    })
    it('timestamp in the future beyond clock skew', () => {
      const fetchedAt = new Date(NOW.getTime() + 10 * 60 * 1000).toISOString()
      expect(quote({ fx: usdRate({ fetchedAt }) })).toEqual({ ok: false, reason: 'FX_INVALID' })
    })
    it('expired rate', () => {
      const fetchedAt = new Date(NOW.getTime() - MAX_RATE_AGE_MS - 1).toISOString()
      expect(quote({ fx: usdRate({ fetchedAt }) })).toEqual({ ok: false, reason: 'FX_STALE' })
    })
    it('accepts a rate exactly at the age limit', () => {
      const fetchedAt = new Date(NOW.getTime() - MAX_RATE_AGE_MS).toISOString()
      expect(quote({ fx: usdRate({ fetchedAt }) }).ok).toBe(true)
    })
    it('TRY does not need (or look at) an FX rate', () => {
      const stale = usdRate({ currency: 'TRY', fetchedAt: '2000-01-01T00:00:00Z', rateMicros: 5 })
      const r = quote({ currency: 'TRY', fx: stale })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.snapshot.fxRateMicros).toBe(1_000_000)
    })
  })

  describe('VAT failures', () => {
    it('missing', () => {
      expect(quote({ vatBps: null })).toEqual({ ok: false, reason: 'VAT_MISSING' })
      expect(quote({ vatBps: undefined })).toEqual({ ok: false, reason: 'VAT_MISSING' })
    })
    it('invalid', () => {
      for (const vatBps of [-1, 10_001, 12.5, Number.NaN]) {
        expect(quote({ vatBps })).toEqual({ ok: false, reason: 'VAT_INVALID' })
      }
    })
  })

  describe('input validation', () => {
    it('unsupported currency codes', () => {
      for (const currency of ['', 'US', 'USDT', '123', 'U$D']) {
        expect(quote({ currency })).toEqual({ ok: false, reason: 'INVALID_CURRENCY' })
      }
      expect(quote({ currency: undefined as unknown as string })).toEqual({ ok: false, reason: 'INVALID_CURRENCY' })
    })
    it('a well-formed currency with no rate is unsupported (FX_MISSING)', () => {
      expect(quote({ currency: 'XYZ' })).toEqual({ ok: false, reason: 'FX_MISSING' })
    })
    it('invalid cost', () => {
      for (const costMinor of [0, -5, 1.5, Number.NaN, 2 ** 60]) {
        expect(quote({ costMinor })).toEqual({ ok: false, reason: 'INVALID_COST' })
      }
    })
    it('invalid period', () => {
      for (const periodYears of [0, -1, 11, 1.5, Number.NaN]) {
        expect(quote({ periodYears })).toEqual({ ok: false, reason: 'INVALID_PERIOD' })
      }
    })
  })

  describe('renewal', () => {
    it('is null and never derived from the registration price', () => {
      const r = quote()
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.snapshot.renewal).toBeNull()
      const view = toQuoteView(r.snapshot)
      expect(Object.keys(view).sort()).toEqual(['currency', 'grossMinor', 'netMinor', 'vatBps', 'vatMinor'])
    })
  })

  describe('snapshot immutability', () => {
    it('is unaffected by later rate changes or mutation of the input rate', () => {
      const fx = usdRate()
      const first = quote({ fx })
      expect(first.ok).toBe(true)
      if (!first.ok) return
      const frozen = JSON.parse(JSON.stringify(first.snapshot))

      fx.rateMicros = 50_000_000
      const second = quote({ fx })
      expect(second.ok).toBe(true)
      if (!second.ok) return

      expect(first.snapshot).toEqual(frozen)
      expect(first.snapshot.grossTryMinor).toBe(69_300)
      expect(second.snapshot.grossTryMinor).not.toBe(first.snapshot.grossTryMinor)
    })
  })

  describe('quote view', () => {
    it('exposes per-year TRY amounts only', () => {
      const r = quote({ periodYears: 2 })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(toQuoteView(r.snapshot)).toEqual({
        currency: 'TRY',
        netMinor: 57_750,
        vatMinor: 11_550,
        grossMinor: 69_300,
        vatBps: 2000,
      })
    })
  })
})
