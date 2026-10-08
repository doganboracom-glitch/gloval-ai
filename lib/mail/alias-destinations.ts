/**
 * Alias destination rules, shared by the Email page (usability hints) and the
 * server action + providers (authoritative). Pure: no env reads, no data
 * access, safe to bundle into client code.
 *
 * Mailcow takes an alias's destinations as ONE comma-separated `goto` string,
 * so a destination containing a comma, whitespace or a newline could smuggle
 * extra addresses into that field. Every destination is therefore parsed as
 * exactly one strict address and rebuilt from the validated value.
 */

export const MAX_ALIAS_DESTINATIONS = 10

/** Hard ceiling on raw input length so a forged payload cannot make us loop over thousands of entries. */
const MAX_RAW_DESTINATIONS = 100

const MAX_ADDRESS_LENGTH = 254
const MAX_LOCAL_PART_LENGTH = 64

const ADDRESS_RE =
  /^[a-z0-9]([a-z0-9._%+-]*[a-z0-9])?@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/

export type AliasDestinationErrorCode =
  | 'INVALID_DESTINATION'
  | 'TOO_MANY_DESTINATIONS'
  | 'SELF_DESTINATION'

export type AliasDestinationResult =
  | { ok: true; destinations: string[] }
  | { ok: false; code: AliasDestinationErrorCode }

/**
 * Returns the lower-cased address when `raw` is exactly one well-formed
 * address, otherwise null. Surrounding spaces/tabs are tolerated (pasted
 * input); anything else that could split or extend the value is rejected.
 */
export function normalizeDestinationAddress(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (/[\r\n]/.test(raw)) return null

  const value = raw.replace(/^[ \t]+|[ \t]+$/g, '').toLowerCase()
  if (value.length === 0 || value.length > MAX_ADDRESS_LENGTH) return null
  if (/[\s,;]/.test(value)) return null
  if (value.includes('..')) return null
  if (!ADDRESS_RE.test(value)) return null

  const localPart = value.slice(0, value.lastIndexOf('@'))
  if (localPart.length > MAX_LOCAL_PART_LENGTH) return null
  return value
}

export function addressDomain(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1)
}

/** True when the address does not belong to `domain` (i.e. it is a forward to the outside world). */
export function isExternalDestination(address: string, domain: string): boolean {
  return addressDomain(address.toLowerCase()) !== domain.toLowerCase()
}

/**
 * Validate and normalize a full destination list.
 *
 * - every entry must be a single valid address (lower-cased, de-duplicated)
 * - at least one and at most MAX_ALIAS_DESTINATIONS destinations
 * - an alias may not forward to itself
 * - an address on the alias's OWN domain must be a known mailbox or alias of
 *   that domain (`internalAddresses`); this stops a customer pointing mail at
 *   an address that does not exist or belongs to someone else. Addresses on any
 *   other domain are external forwards and are not checked against it. Pass
 *   `null` to skip the ownership check (format-only validation).
 */
export function validateAliasDestinations(input: {
  aliasAddress: string
  domain: string
  destinations: unknown
  internalAddresses: ReadonlySet<string> | null
}): AliasDestinationResult {
  const { destinations, internalAddresses } = input
  if (!Array.isArray(destinations) || destinations.length === 0) {
    return { ok: false, code: 'INVALID_DESTINATION' }
  }
  if (destinations.length > MAX_RAW_DESTINATIONS) {
    return { ok: false, code: 'TOO_MANY_DESTINATIONS' }
  }

  const aliasAddress = input.aliasAddress.toLowerCase()
  const domain = input.domain.toLowerCase()
  const seen = new Set<string>()

  for (const raw of destinations) {
    const address = normalizeDestinationAddress(raw)
    if (!address) return { ok: false, code: 'INVALID_DESTINATION' }
    if (address === aliasAddress) return { ok: false, code: 'SELF_DESTINATION' }
    if (
      internalAddresses &&
      !isExternalDestination(address, domain) &&
      !internalAddresses.has(address)
    ) {
      return { ok: false, code: 'INVALID_DESTINATION' }
    }
    seen.add(address)
  }

  if (seen.size > MAX_ALIAS_DESTINATIONS) return { ok: false, code: 'TOO_MANY_DESTINATIONS' }
  return { ok: true, destinations: [...seen] }
}
