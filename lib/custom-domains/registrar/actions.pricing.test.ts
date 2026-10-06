import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  createIntent: vi.fn(),
  checkAvailability: vi.fn(),
  loadPricingContext: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'u@example.com' } } }) },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.adminFrom }) }))
vi.mock('@/lib/payments', () => ({
  getPlatformPaymentProvider: () => ({ createIntent: mocks.createIntent }),
  getPlatformPaymentProviderId: () => 'mock',
}))
vi.mock('@/lib/billing', () => ({
  getMyCurrentPlan: async () => ({}),
  getMySubscription: async () => ({}),
}))
vi.mock('@/lib/custom-domains/access', () => ({
  getDomainEntitlement: () => ({ allowed: true, maxDomains: 5 }),
}))
vi.mock('@/lib/custom-domains/service', () => ({ listDomainsForUser: async () => [] }))
vi.mock('@/lib/custom-domains/registrar/provider', () => ({
  getDomainRegistrarProvider: () => ({ checkAvailability: mocks.checkAvailability }),
  isLiveDomainRegistrar: () => true,
}))
vi.mock('@/lib/custom-domains/registrar/service', () => ({
  finalizeDomainOrder: vi.fn(),
  searchDomainAvailability: vi.fn(),
  parsePurchaseDomain: (d: string) => ({ domain: d, tld: d.split('.').slice(1).join('.') }),
}))
vi.mock('@/lib/custom-domains/pricing/context', () => ({ loadPricingContext: mocks.loadPricingContext }))

import { startMyDomainPurchase } from './actions'

const contact = {} as Parameters<typeof startMyDomainPurchase>[2]

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  mocks.checkAvailability.mockResolvedValue([
    { domain: 'example.com', status: 'available', price: { registerCents: 1000, currency: 'USD' } },
  ])
})

describe('startMyDomainPurchase pricing guard', () => {
  it.each([
    ['VAT missing', { vatBps: null, rates: {} }],
    [
      'FX stale',
      {
        vatBps: 2000,
        rates: { USD: { currency: 'USD', rateMicros: 38_500_000, source: 's', fetchedAt: '2020-01-01T00:00:00Z' } },
      },
    ],
    ['FX missing', { vatBps: 2000, rates: {} }],
  ])('returns PRICING_UNAVAILABLE and writes nothing (%s)', async (_label, context) => {
    mocks.loadPricingContext.mockResolvedValue(context)

    const result = await startMyDomainPurchase('example.com', 1, contact)

    expect(result).toEqual({ ok: false, error: 'PRICING_UNAVAILABLE' })
    expect(mocks.adminFrom).not.toHaveBeenCalled()
    expect(mocks.createIntent).not.toHaveBeenCalled()
  })

  it('returns PRICING_UNAVAILABLE and writes nothing for EUR (no EUR rate defined)', async () => {
    mocks.loadPricingContext.mockResolvedValue({
      vatBps: 2000,
      rates: {
        USD: { currency: 'USD', rateMicros: 50_000_000, source: 'fixed_manual_rate', fetchedAt: '2026-01-01T00:00:00Z', kind: 'fixed' },
      },
    })
    mocks.checkAvailability.mockResolvedValue([
      { domain: 'example.com', status: 'available', price: { registerCents: 1000, currency: 'EUR' } },
    ])
    const result = await startMyDomainPurchase('example.com', 1, contact)
    expect(result).toEqual({ ok: false, error: 'PRICING_UNAVAILABLE' })
    expect(mocks.adminFrom).not.toHaveBeenCalled()
    expect(mocks.createIntent).not.toHaveBeenCalled()
  })

  it('ignores any extra client-supplied price arguments', async () => {
    mocks.loadPricingContext.mockResolvedValue({ vatBps: null, rates: {} })
    const call = startMyDomainPurchase as unknown as (...args: unknown[]) => Promise<unknown>
    const result = await call('example.com', 1, contact, undefined, { priceCents: 1, vatBps: 0 })
    expect(result).toEqual({ ok: false, error: 'PRICING_UNAVAILABLE' })
    expect(mocks.adminFrom).not.toHaveBeenCalled()
  })
})
