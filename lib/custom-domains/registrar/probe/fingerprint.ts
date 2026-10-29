import { createHash } from 'node:crypto'
import type { DomainContact } from '../types'

/**
 * Same fields, same normalization as the provider's `contactMatches`, so two
 * equal fingerprints mean "the registrar would treat these as the same contact".
 * Only the hash is stored; the contact itself never reaches the event log.
 */
export function contactFingerprint(contact: DomainContact | null): string | null {
  if (!contact) return null
  const canonical = [
    contact.firstName,
    contact.lastName,
    contact.email,
    contact.addressLine1,
    contact.city,
    contact.country,
    contact.zipCode,
    contact.phoneCountryCode,
    contact.phone,
  ]
    .map((v) => String(v ?? '').trim().toLowerCase())
    .join('|')
  return createHash('sha256').update(canonical).digest('hex')
}

/** `jane.doe@example.com` -> `j***@e***.com`; enough to tell two addresses apart without storing either. */
export function maskEmail(email: string): string {
  const [local = '', host = ''] = email.trim().toLowerCase().split('@')
  const dot = host.lastIndexOf('.')
  const name = dot > 0 ? host.slice(0, dot) : host
  const tld = dot > 0 ? host.slice(dot) : ''
  return `${local.slice(0, 1)}***@${name.slice(0, 1)}***${tld}`
}
