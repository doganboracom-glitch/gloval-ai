import type {
  DomainAvailabilityResult,
  DomainRegistrarProvider,
  RegisterDomainInput,
  RegisterDomainResult,
} from './types'

/**
 * Explicit dev/test-only fallback. Only ever selected when
 * `DOMAIN_REGISTRAR_MOCK=true` is set AND no real DomainNameAPI credentials
 * are configured (see `./provider.ts`) — never a silent default in
 * production, so a missing credential can't be mistaken for a working
 * integration or (worse) simulate spending real money on a real domain.
 */
export class MockRegistrarProvider implements DomainRegistrarProvider {
  readonly id = 'mock'
  readonly live = false

  async checkAvailability(domain: string, altTlds: string[] = []): Promise<DomainAvailabilityResult[]> {
    const [label, ...rest] = domain.toLowerCase().split('.')
    const primaryTld = rest.join('.')
    const tlds = Array.from(new Set([primaryTld, ...altTlds]))

    // Deterministic pseudo-availability from the label so demoing feels
    // stable rather than random on every search.
    let hash = 0
    for (const ch of label) hash = (hash * 31 + ch.charCodeAt(0)) % 997

    return tlds.map((tld, i) => {
      const seed = (hash + i * 37) % 5
      const status: DomainAvailabilityResult['status'] = seed === 0 ? 'unavailable' : 'available'
      return {
        domain: `${label}.${tld}`,
        tld,
        status,
        price:
          status === 'available'
            ? { registerCents: 129900 + seed * 5000, renewCents: 149900 + seed * 5000, currency: 'USD' }
            : null,
      }
    })
  }

  async registerDomain(input: RegisterDomainInput): Promise<RegisterDomainResult> {
    const expires = new Date()
    expires.setFullYear(expires.getFullYear() + input.periodYears)
    return {
      providerDomainId: `mock_${input.domain}`,
      expiresAt: expires.toISOString(),
      raw: { mock: true, domain: input.domain },
    }
  }
}
