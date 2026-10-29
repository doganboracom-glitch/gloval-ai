/**
 * Input rules for the public domain search. Pure, no I/O.
 *
 * Policy: ASCII only. Internationalised names (non-ASCII letters or `xn--`
 * punycode) are rejected, not silently transliterated, because the registrar
 * flow downstream is ASCII-only and a silent rewrite would sell the buyer a
 * different name than the one they typed.
 */

/**
 * The only extensions the public page searches and prices. A bare label is
 * checked across all of them; a typed extension must be one of them. Extend
 * this list only for TLDs the registrar account is confirmed to sell.
 */
export const PUBLIC_SEARCH_TLDS = ['com', 'net', 'org', 'co', 'com.tr', 'info'] as const
export type PublicSearchTld = (typeof PUBLIC_SEARCH_TLDS)[number]

export const MAX_QUERY_LENGTH = 100
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export type PublicSearchParse =
  | { ok: true; label: string; tld: PublicSearchTld | null }
  | { ok: false; error: 'INVALID_QUERY' | 'UNSUPPORTED_TLD' }

export function isSupportedPublicTld(value: string): value is PublicSearchTld {
  return (PUBLIC_SEARCH_TLDS as readonly string[]).includes(value)
}

/** Accepts "marka", "marka.com", "https://www.marka.com/yol?x=1"; rejects anything else. */
export function parsePublicSearchQuery(raw: unknown): PublicSearchParse {
  if (typeof raw !== 'string') return { ok: false, error: 'INVALID_QUERY' }
  if (raw.length > MAX_QUERY_LENGTH || CONTROL_CHARS.test(raw)) return { ok: false, error: 'INVALID_QUERY' }

  let value = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '')
  if (!value || /\s/.test(value)) return { ok: false, error: 'INVALID_QUERY' }
  if (value.startsWith('www.') && value.split('.').length > 2) value = value.slice(4)

  const parts = value.split('.')
  const [label, ...rest] = parts
  if (!LABEL_PATTERN.test(label)) return { ok: false, error: 'INVALID_QUERY' }
  // Positions 3-4 holding "--" are reserved (covers punycode `xn--`).
  if (label.slice(2, 4) === '--') return { ok: false, error: 'INVALID_QUERY' }

  if (rest.length === 0) return { ok: true, label, tld: null }

  const tld = rest.join('.')
  if (rest.some((part) => !/^[a-z0-9-]{1,63}$/.test(part))) return { ok: false, error: 'INVALID_QUERY' }
  if (!isSupportedPublicTld(tld)) return { ok: false, error: 'UNSUPPORTED_TLD' }
  return { ok: true, label, tld }
}

/** Strict full-domain check used for `?buy=` hand-offs: label + a supported extension, nothing else. */
export function parsePublicDomain(raw: unknown): { domain: string; label: string; tld: PublicSearchTld } | null {
  if (typeof raw !== 'string' || raw !== raw.trim().toLowerCase()) return null
  const parsed = parsePublicSearchQuery(raw)
  if (!parsed.ok || !parsed.tld) return null
  const domain = `${parsed.label}.${parsed.tld}`
  return domain === raw ? { domain, label: parsed.label, tld: parsed.tld } : null
}
