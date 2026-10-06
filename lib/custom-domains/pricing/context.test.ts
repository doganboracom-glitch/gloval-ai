import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPricingContext } from './context'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('loadPricingContext', () => {
  it('uses the fixed manual USD rate and nothing else', async () => {
    vi.stubEnv('DOMAIN_VAT_RATE_PERCENT', '20')
    const c = await loadPricingContext()
    expect(c.vatBps).toBe(2000)
    expect(Object.keys(c.rates)).toEqual(['USD'])
    expect(c.rates.USD).toMatchObject({
      currency: 'USD',
      rateMicros: 50_000_000,
      source: 'fixed_manual_rate',
      kind: 'fixed',
    })
  })

  it('defaults VAT to 20% when unset, and fails closed when set but invalid', async () => {
    vi.stubEnv('DOMAIN_VAT_RATE_PERCENT', '')
    expect((await loadPricingContext()).vatBps).toBe(2000)
    vi.stubEnv('DOMAIN_VAT_RATE_PERCENT', 'twenty')
    expect((await loadPricingContext()).vatBps).toBeNull()
  })
})
