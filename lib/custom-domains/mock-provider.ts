import { PLATFORM_DOMAIN } from '@/lib/domains'
import {
  DomainError,
  type AddDomainInput,
  type CustomDomain,
  type DnsRecord,
  type DomainProvider,
  emailRecordKey,
  EMPTY_CONNECTION,
} from './types'

/**
 * In-memory domain provider used until a real DNS/registrar integration exists.
 *
 * Deliberate behaviours:
 *
 *  - It starts EMPTY. No seeded demo domain is attributed to a real user, so
 *    nobody is shown a domain (or an entitlement) they do not actually have.
 *  - `verifiesForReal` is false and every domain it returns carries `mock: true`.
 *    Verification here is simulated: no DNS lookup happens. The UI reads that
 *    flag and says so, so a simulated pass is never mistaken for a real one.
 *  - Every DNS record it emits is `placeholder: true`. The values are shaped
 *    like the real thing so the UI can be built and reviewed, but they are not
 *    publishable and the UI must present them as placeholders.
 *
 * State lives at module scope, which means it resets on server restart. That is
 * the correct trade-off for a provider stub: it keeps a realistic async
 * boundary without inventing a database table.
 */

const store = new Map<string, CustomDomain>()
let seq = 0

function nextId(): string {
  seq += 1
  return `dom_${Date.now().toString(36)}${seq.toString(36)}`
}

/**
 * Placeholder DNS records for a domain.
 *
 * Website records point at the platform, and mail records are shaped like a
 * normal MX/SPF/DKIM/DMARC set so the email section of the detail page can be
 * built. `placeholder: true` on every one of them is what keeps this honest.
 */
export function placeholderDns(domain: string): DnsRecord[] {
  const token = `gloval-verify-${domain.replace(/[^a-z0-9]/g, '').slice(0, 12)}`

  return [
    {
      type: 'TXT',
      host: '@',
      value: `gloval-site-verification=${token}`,
      purpose: 'verification',
      verified: false,
      placeholder: true,
    },
    {
      type: 'A',
      host: '@',
      value: '203.0.113.10', // RFC 5737 documentation range, never routable.
      purpose: 'website',
      verified: false,
      placeholder: true,
    },
    {
      type: 'CNAME',
      host: 'www',
      value: `cname.${PLATFORM_DOMAIN}`,
      purpose: 'website',
      verified: false,
      placeholder: true,
    },
    {
      type: 'MX',
      host: '@',
      value: `mx1.${PLATFORM_DOMAIN}`,
      priority: 10,
      purpose: 'email',
      verified: false,
      placeholder: true,
    },
    {
      type: 'MX',
      host: '@',
      value: `mx2.${PLATFORM_DOMAIN}`,
      priority: 20,
      purpose: 'email',
      verified: false,
      placeholder: true,
    },
    {
      type: 'TXT',
      host: '@',
      value: `v=spf1 include:_spf.${PLATFORM_DOMAIN} ~all`,
      label: 'SPF',
      purpose: 'email',
      verified: false,
      placeholder: true,
    },
    {
      type: 'TXT',
      host: 'gloval._domainkey',
      value: 'v=DKIM1; k=rsa; p=PLACEHOLDER_PUBLIC_KEY',
      label: 'DKIM',
      purpose: 'email',
      verified: false,
      placeholder: true,
    },
    {
      type: 'TXT',
      host: '_dmarc',
      value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`,
      label: 'DMARC',
      purpose: 'email',
      verified: false,
      placeholder: true,
    },
  ]
}

function clone(domain: CustomDomain): CustomDomain {
  return { ...domain, dns: domain.dns.map((r) => ({ ...r })) }
}

function sorted(domains: CustomDomain[]): CustomDomain[] {
  // Primary first, then newest, so list order is stable and meaningful.
  return domains.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
  })
}

export class MockDomainProvider implements DomainProvider {
  readonly id = 'mock'
  readonly verifiesForReal = false

  async listDomains(userId?: string): Promise<CustomDomain[]> {
    const all = [...store.values()]
    return sorted((userId ? all.filter((d) => d.userId === userId) : all).map(clone))
  }

  async listDomainsPage(
    userId: string,
    request: { page: number; pageSize: number },
  ): Promise<{ items: CustomDomain[]; total: number }> {
    const mine = await this.listDomains(userId)
    const start = (request.page - 1) * request.pageSize
    return { items: mine.slice(start, start + request.pageSize), total: mine.length }
  }

  async getDomain(domainId: string): Promise<CustomDomain | null> {
    const found = store.get(domainId)
    return found ? clone(found) : null
  }

  async findActiveByHost(host: string): Promise<CustomDomain | null> {
    for (const d of store.values()) {
      if (d.domain === host && d.status === 'active') return clone(d)
    }
    return null
  }

  async findActiveByHostname(domain: string): Promise<CustomDomain | null> {
    for (const d of store.values()) {
      if (d.domain === domain && d.status === 'active') return clone(d)
    }
    return null
  }

  async syncConnection(domainId: string): Promise<CustomDomain> {
    const existing = store.get(domainId)
    if (!existing) throw new DomainError('NOT_FOUND')
    return clone(existing)
  }

  async addDomain({ userId, domain, registered, websiteProjectId }: AddDomainInput): Promise<CustomDomain> {
    // A domain may only be claimed once across the whole platform: two tenants
    // cannot both own the DNS for `firma.com`.
    for (const existing of store.values()) {
      if (existing.domain === domain) {
        if (registered && existing.userId === userId) return clone(existing)
        throw new DomainError('DOMAIN_EXISTS')
      }
    }

    const isFirst = ![...store.values()].some((d) => d.userId === userId)

    const created: CustomDomain = {
      id: nextId(),
      userId,
      domain,
      status: registered ? 'active' : 'pending',
      isPrimary: isFirst,
      dns: placeholderDns(domain),
      websiteProjectId: websiteProjectId ?? null,
      emailEnabled: false,
      createdAt: new Date().toISOString(),
      verifiedAt: registered ? new Date().toISOString() : null,
      connection: { ...EMPTY_CONNECTION },
      mock: true,
      source: registered ? 'registrar' : 'external',
      expiresAt: registered?.expiresAt ?? null,
    }

    store.set(created.id, created)
    return clone(created)
  }

  async removeDomain(domainId: string): Promise<void> {
    const existing = store.get(domainId)
    if (!existing) throw new DomainError('NOT_FOUND')
    store.delete(domainId)

    // Never leave a user with domains but no primary.
    if (existing.isPrimary) {
      const remaining = sorted(
        [...store.values()].filter((d) => d.userId === existing.userId),
      )
      const next = remaining[0]
      if (next) store.set(next.id, { ...next, isPrimary: true })
    }
  }

  async startVerification(domainId: string): Promise<CustomDomain> {
    const existing = store.get(domainId)
    if (!existing) throw new DomainError('NOT_FOUND')
    if (existing.source !== 'external') throw new DomainError('FORBIDDEN')
    if (existing.status !== 'pending') return clone(existing)

    const updated: CustomDomain = { ...existing, status: 'verifying' }
    store.set(domainId, updated)
    return clone(updated)
  }

  /**
   * Simulated verification. No DNS query is performed; the domain is moved to
   * `active` so downstream flows (website binding, mailbox creation) can be
   * exercised. `mock: true` and `placeholder: true` records are what tell the
   * UI to keep labelling this as a test result.
   */
  async verifyDomain(domainId: string): Promise<CustomDomain> {
    const existing = store.get(domainId)
    if (!existing) throw new DomainError('NOT_FOUND')

    const updated: CustomDomain = {
      ...existing,
      status: 'active',
      verifiedAt: new Date().toISOString(),
      // Email records have their own check; domain verification must not mark them.
      dns: existing.dns.map((r) => (r.purpose === 'email' ? { ...r } : { ...r, verified: true })),
    }
    store.set(domainId, updated)
    return clone(updated)
  }

  async saveEmailDnsVerification(domainId: string, checked: DnsRecord[]): Promise<CustomDomain> {
    const existing = store.get(domainId)
    if (!existing) throw new DomainError('NOT_FOUND')
    const flags = new Map(checked.filter((r) => r.purpose === 'email').map((r) => [emailRecordKey(r), r.verified]))
    const updated: CustomDomain = {
      ...existing,
      dns: existing.dns.map((r) =>
        r.purpose === 'email' ? { ...r, verified: r.placeholder ? false : (flags.get(emailRecordKey(r)) ?? r.verified) } : r,
      ),
    }
    store.set(domainId, updated)
    return clone(updated)
  }

  async setPrimary(userId: string, domainId: string): Promise<CustomDomain[]> {
    const target = store.get(domainId)
    if (!target || target.userId !== userId) throw new DomainError('NOT_FOUND')

    for (const [id, domain] of store) {
      if (domain.userId !== userId) continue
      store.set(id, { ...domain, isPrimary: id === domainId })
    }
    return this.listDomains(userId)
  }

  /**
   * Business rules (verified status, project ownership/published state) are
   * enforced by the caller (`lib/custom-domains/actions.ts`) before this runs —
   * the provider just persists the pointer.
   */
  async setWebsiteProject(domainId: string, projectId: string | null): Promise<CustomDomain> {
    const existing = store.get(domainId)
    if (!existing) throw new DomainError('NOT_FOUND')

    const updated: CustomDomain = { ...existing, websiteProjectId: projectId }
    store.set(domainId, updated)
    return clone(updated)
  }
}
