import { describe, expect, it } from 'vitest'
import type { FxRate } from './calc'
import { priceTldRegistrations } from './catalog'
import type { PricingContext } from './order'

const NOW = new Date('2026-03-10T12:00:00.000Z')

function context(): PricingContext {
  const usd: FxRate = {
    currency: 'USD',
    rateMicros: 38_500_000,
    source: 'fixture',
    fetchedAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
  }
  return { vatBps: 2000, rates: { USD: usd } }
}

describe('priceTldRegistrations', () => {
  it('uses checkout pricing, omits unpriced rows, and ranks popular extensions first', () => {
    const result = priceTldRegistrations(
      [
        { tld: 'qzz', registerCents: 1000, currency: 'USD' },
        { tld: 'io', registerCents: 1000, currency: 'USD' },
        { tld: 'zero', registerCents: 0, currency: 'USD' },
        { tld: 'jpy', registerCents: 500, currency: 'JPY' },
      ],
      context(),
      NOW,
    )

    expect(result.map(({ tld }) => tld)).toEqual(['io', 'qzz'])
    expect(result[0].popular).toBe(true)
    expect(result[0].quote).toMatchObject({
      currency: 'TRY',
      netMinor: 57_750,
      vatMinor: 11_550,
      grossMinor: 69_300,
      vatBps: 2000,
    })
    expect(result[1].popular).toBe(false)
  })
})
