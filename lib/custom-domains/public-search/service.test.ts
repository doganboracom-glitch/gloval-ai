import { describe, expect, it, vi } from 'vitest'
import type { DomainAvailabilityResult } from '../registrar/types'
import { RegistrarError } from '../registrar/types'
import { TtlCache } from './cache'
import type { LimiterDeps } from './limits'
import { runPublicDomainSearch, type PublicSearchDeps } from './service'

const allowAll: LimiterDeps = { reserve: async () => ({ allowed: true }), release: async () => {} }

const row = (domain: string, tld: string): DomainAvailabilityResult =>
  ({
    domain,
    tld,
    status: 'available',
    price: { registerCents: 1000, currency: 'USD' },
  }) as DomainAvailabilityResult

function makeDeps(overrides: Partial<PublicSearchDeps> = {}): PublicSearchDeps {
  return {
    isOpen: () => true,
    fetchAvailability: vi.fn(async (label: string) => [row(`${label}.com`, 'com'), row(`${label}.net`, 'net')]),
    priceRows: vi.fn(async (rows: DomainAvailabilityResult[]) =>
      rows.map((r) => ({
        domain: r.domain,
        tld: r.tld,
        status: r.status,
        quote: { currency: 'TRY' as const, netMinor: 50000, vatMinor: 10000, grossMinor: 60000, vatBps: 2000 },
      })),
    ),
    limiter: allowAll,
    cache: new TtlCache<DomainAvailabilityResult[]>(60_000),
    ...overrides,
  }
}

const input = (query: unknown) => ({ query, ip: '1.2.3.4', userId: null })

describe('runPublicDomainSearch', () => {
  it('is closed when the registrar is not live', async () => {
    const deps = makeDeps({ isOpen: () => false })
    expect(await runPublicDomainSearch(input('marka'), deps)).toEqual({ ok: false, error: 'NOT_CONFIGURED' })
    expect(deps.fetchAvailability).not.toHaveBeenCalled()
  })

  it('returns only the whitelisted shape with a TRY quote and no provider cost', async () => {
    const result = await runPublicDomainSearch(input('marka'), makeDeps())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.results).toHaveLength(2)
    expect(Object.keys(result.results[0]).sort()).toEqual(['domain', 'quote', 'status', 'tld'])
    expect(JSON.stringify(result)).not.toMatch(/USD|registerCents|cost/i)
    expect(result.pricingAvailable).toBe(true)
  })

  it('rejects invalid input before touching the registrar and records a strike', async () => {
    const reserve = vi.fn(async (_subject: string, _limit: number, _windowSeconds: number) => ({ allowed: true }))
    const deps = makeDeps({ limiter: { reserve, release: async () => {} } })
    expect(await runPublicDomainSearch(input('mağaza'), deps)).toEqual({ ok: false, error: 'INVALID_QUERY' })
    expect(await runPublicDomainSearch(input('marka.xyz'), deps)).toEqual({ ok: false, error: 'UNSUPPORTED_TLD' })
    expect(deps.fetchAvailability).not.toHaveBeenCalled()
    expect(reserve.mock.calls.filter(([subject]) => String(subject).startsWith('domsearch:strike:')).length).toBeGreaterThan(2)
  })

  it('serves repeat searches from the cache with one registrar call', async () => {
    const deps = makeDeps()
    await runPublicDomainSearch(input('marka'), deps)
    await runPublicDomainSearch(input('MARKA'), deps)
    expect(deps.fetchAvailability).toHaveBeenCalledTimes(1)
  })

  it('refuses a blocked caller without searching', async () => {
    const limiter: LimiterDeps = {
      reserve: async (subject) => (subject.startsWith('domsearch:strike:') ? { allowed: false } : { allowed: true }),
      release: async () => {},
    }
    const deps = makeDeps({ limiter })
    const result = await runPublicDomainSearch(input('marka'), deps)
    expect(result).toMatchObject({ ok: false, error: 'RATE_LIMITED' })
    expect(deps.fetchAvailability).not.toHaveBeenCalled()
  })

  it('fails closed when the rate limit counter is unavailable', async () => {
    const deps = makeDeps({ limiter: { reserve: async () => null, release: async () => {} } })
    expect(await runPublicDomainSearch(input('marka'), deps)).toEqual({ ok: false, error: 'TEMPORARILY_UNAVAILABLE' })
  })

  it('collapses registrar errors to a code without leaking the message', async () => {
    const secret = 'upstream said: key=abc123'
    const deps = makeDeps({
      fetchAvailability: async () => {
        throw new RegistrarError('PROVIDER_ERROR', secret)
      },
    })
    const result = await runPublicDomainSearch(input('marka'), deps)
    expect(result).toEqual({ ok: false, error: 'PROVIDER_ERROR' })
    expect(JSON.stringify(result)).not.toContain('abc123')
  })

  it('drops rows outside the whitelist or for a different label', async () => {
    const deps = makeDeps({
      fetchAvailability: async () => [row('marka.com', 'com'), row('marka.xyz', 'xyz'), row('baska.com', 'com')],
    })
    const result = await runPublicDomainSearch(input('marka'), deps)
    expect(result.ok && result.results.map((r) => r.domain)).toEqual(['marka.com'])
  })
})
