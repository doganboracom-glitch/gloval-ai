import { recordFqdn, type DnsResolver } from './connection'
import type { DnsRecord } from './types'

/**
 * Email DNS check (MX / SPF / DKIM / DMARC).
 *
 * Deliberately separate from domain ownership and website connection: it reads
 * only the `purpose: 'email'` records, never changes the domain's status, and
 * never touches ownership or website records.
 *
 *  - `not_issued`: there are no real mail records to check yet (none exist, or
 *    every one is a placeholder). Nothing is looked up and nothing is marked
 *    verified, so a stand-in value can never read as a published record.
 *  - `unavailable`: the resolver failed. That proves nothing about the DNS, so
 *    the caller must keep the stored state.
 */
export type EmailDnsStatus = 'verified' | 'incomplete' | 'not_issued' | 'unavailable'

export type EmailDnsOutcome = { status: EmailDnsStatus; records: DnsRecord[] }

const normalizeHost = (value: string) => value.trim().toLowerCase().replace(/\.$/, '')
const squash = (value: string) => value.trim().replace(/\s+/g, ' ')

function tagValue(record: string, tag: string): string | null {
  const match = new RegExp(`(?:^|;)\\s*${tag}\\s*=\\s*([^;]*)`, 'i').exec(record)
  return match ? match[1].replace(/\s+/g, '') : null
}

/** Whether a published TXT value satisfies the expected one, by record role. */
export function txtSatisfies(label: DnsRecord['label'], expected: string, found: string): boolean {
  switch (label) {
    case 'SPF': {
      if (!/^v=spf1\b/i.test(found)) return false
      const required = expected.split(/\s+/).filter((token) => /^(include|ip4|ip6):/i.test(token))
      if (required.length === 0) return squash(found).toLowerCase() === squash(expected).toLowerCase()
      const present = new Set(found.split(/\s+/).map((token) => token.toLowerCase()))
      return required.every((token) => present.has(token.toLowerCase()))
    }
    case 'DKIM': {
      const want = tagValue(expected, 'p')
      return want !== null && tagValue(found, 'p') === want
    }
    case 'DMARC':
      // The policy is the customer's to tune; only the presence of a DMARC record is required.
      return /^v=DMARC1\b/i.test(found.trim())
    default:
      return squash(found) === squash(expected)
  }
}

async function recordPublished(domain: string, record: DnsRecord, resolver: DnsResolver): Promise<boolean> {
  const name = recordFqdn(domain, record.host)
  if (record.type === 'MX') {
    if (!resolver.mx) throw new Error('mx_lookup_unsupported')
    const exchanges = await resolver.mx(name)
    return exchanges.map(normalizeHost).includes(normalizeHost(record.value))
  }
  if (record.type === 'TXT') {
    const values = await resolver.txt(name)
    return values.some((found) => txtSatisfies(record.label, record.value, found))
  }
  return false
}

export async function checkEmailDns(
  domain: string,
  dns: DnsRecord[],
  resolver: DnsResolver,
): Promise<EmailDnsOutcome> {
  const email = dns.filter((r) => r.purpose === 'email')
  const real = email.filter((r) => !r.placeholder)

  if (real.length === 0) {
    return { status: 'not_issued', records: dns.map((r) => (r.purpose === 'email' ? { ...r, verified: false } : r)) }
  }

  let results: boolean[]
  try {
    results = await Promise.all(real.map((r) => recordPublished(domain, r, resolver)))
  } catch {
    return { status: 'unavailable', records: dns }
  }

  const verifiedByRecord = new Map<DnsRecord, boolean>(real.map((r, i) => [r, results[i]]))
  const records = dns.map((r) => {
    if (r.purpose !== 'email') return r
    return { ...r, verified: verifiedByRecord.get(r) ?? false }
  })

  const status: EmailDnsStatus = results.every(Boolean) && real.length === email.length ? 'verified' : 'incomplete'
  return { status, records }
}
