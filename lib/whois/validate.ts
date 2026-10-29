import { domainToASCII, domainToUnicode } from 'node:url'
import { isIP } from 'node:net'

/**
 * Input rules for the public WHOIS lookup. Pure, no I/O.
 *
 * Only a bare registrable domain is accepted: URLs, paths, ports, credentials,
 * IP literals, single labels (localhost) and reserved/internal suffixes are all
 * refused before anything leaves the server. Internationalised names are
 * converted to punycode and the *converted* result is validated strictly.
 */

import { MAX_WHOIS_INPUT_LENGTH } from './constants'

export { MAX_WHOIS_INPUT_LENGTH }
const MAX_DOMAIN_LENGTH = 253

// Whitespace, control characters and everything that makes input look like a
// URL, an address with credentials/port, or a shell/HTML fragment.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\s\u0000-\u001f\u007f\u0085\u00a0\/\\?#@:%[\]<>"'`|^{}()*,;=+!$&~_]/
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const TLD = /^(?:xn--[a-z0-9-]{1,59}|[a-z][a-z0-9-]{0,61}[a-z0-9]|[a-z])$/

const RESERVED_TLDS = new Set([
  'localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'home', 'corp', 'private',
  'test', 'invalid', 'example', 'onion', 'arpa', 'alt', 'home.arpa',
])

/** Second-level registries under which a third label is still a registrable name (example.co.uk). */
const SECOND_LEVEL_LABELS = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'ne', 'or', 'gen', 'web', 'biz', 'info', 'nom'])

export type WhoisParse =
  | { ok: true; domain: string; label: string; suffix: string; unicode: string }
  | { ok: false; error: 'INVALID_QUERY' }

const invalid = (): WhoisParse => ({ ok: false, error: 'INVALID_QUERY' })

export function parseWhoisQuery(raw: unknown): WhoisParse {
  if (typeof raw !== 'string') return invalid()
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > MAX_WHOIS_INPUT_LENGTH) return invalid()
  if (FORBIDDEN_CHARS.test(trimmed)) return invalid()

  let value = trimmed.toLowerCase()
  if (value.endsWith('.')) value = value.slice(0, -1)
  if (!value || value.startsWith('.') || value.includes('..')) return invalid()
  if (isIP(value) !== 0) return invalid()

  const ascii = domainToASCII(value)
  if (!ascii || ascii.length > MAX_DOMAIN_LENGTH) return invalid()
  if (isIP(ascii) !== 0) return invalid()

  let labels = ascii.split('.')
  if (labels.length > 2 && labels[0] === 'www') labels = labels.slice(1)
  if (labels.length < 2) return invalid()

  for (const label of labels) {
    if (!LABEL.test(label)) return invalid()
    // "--" in positions 3-4 is reserved for IDNA; only a real xn-- label may use it.
    if (label.slice(2, 4) === '--' && !label.startsWith('xn--')) return invalid()
  }

  const tld = labels[labels.length - 1]
  // A purely numeric suffix is how decimal/octal/hex IP spellings (127.1, 0x7f.1) look.
  if (!TLD.test(tld) || RESERVED_TLDS.has(tld)) return invalid()

  if (labels.length > 3) return invalid()
  if (labels.length === 3 && !SECOND_LEVEL_LABELS.has(labels[1])) return invalid()

  const domain = labels.join('.')
  if (domain.length > MAX_DOMAIN_LENGTH) return invalid()
  // Every xn-- label must be decodable, otherwise it is not a real IDN.
  if (labels.some((l) => l.startsWith('xn--')) && !domainToUnicode(domain)) return invalid()

  return {
    ok: true,
    domain,
    label: labels[0],
    suffix: labels.slice(1).join('.'),
    unicode: domainToUnicode(domain) || domain,
  }
}
