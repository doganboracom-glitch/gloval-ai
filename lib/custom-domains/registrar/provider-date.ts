/**
 * DomainNameAPI date handling.
 *
 * The REST API returns dates such as `2027-10-04T17:55:29.4171901` with NO zone
 * designator on `domains/info` and `domains` list rows, while other replies
 * (e.g. the register response) carry an explicit `Z` / offset. The API does not
 * document what wall clock the zone-less form uses, and the `nodejs-dna`
 * `formatApiDate` helper converts zoned values into the *server process* zone,
 * so its output depends on where the code runs.
 *
 * Rule: an instant is only produced when the raw value names its own zone. A
 * zone-less value is never guessed into UTC; callers keep the raw string.
 */

export type ProviderDate = {
  /** Verbatim provider value, or null when absent/blank. */
  raw: string | null
  /** UTC ISO-8601 instant, only when `raw` carries an explicit zone. */
  instant: string | null
  zone: 'explicit' | 'unknown' | 'none'
}

const EXPLICIT_ZONE = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i
const ISO_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?/
// 0001-01-01 is the provider's "never happened" placeholder (e.g. transferDate).
const PLACEHOLDER = /^0001-01-01/

export function parseProviderDate(value: unknown): ProviderDate {
  if (typeof value !== 'string') return { raw: null, instant: null, zone: 'none' }
  const raw = value.trim()
  if (!raw || PLACEHOLDER.test(raw)) return { raw: null, instant: null, zone: 'none' }
  if (!ISO_SHAPE.test(raw) || !EXPLICIT_ZONE.test(raw)) return { raw, instant: null, zone: 'unknown' }

  // V8 only guarantees millisecond fractions; trim longer ones before parsing.
  const normalized = raw.replace(/(\.\d{3})\d+/, '$1')
  const time = Date.parse(normalized)
  if (!Number.isFinite(time)) return { raw, instant: null, zone: 'unknown' }
  return { raw, instant: new Date(time).toISOString(), zone: 'explicit' }
}

/**
 * Reads a raw date field off the SDK's last HTTP body. `lastResponse` is the
 * unformatted reply, so it still has the provider's original string.
 */
/**
 * Orders two raw provider dates that share the same format (both read from
 * GetDetails). Only the relative order is used; no zone is assumed or exposed.
 */
export function isLaterRawDate(candidate: string | null, baseline: string | null): boolean {
  if (!candidate || !baseline) return false
  const toMs = (raw: string) =>
    Date.parse(raw.replace(/(\.\d{3})\d+/, '$1').replace(/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i, '') + 'Z')
  const a = toMs(candidate)
  const b = toMs(baseline)
  return Number.isFinite(a) && Number.isFinite(b) && a > b
}

export function readRawField(lastResponse: unknown, field: string): string | undefined {
  if (!lastResponse || typeof lastResponse !== 'object') return undefined
  const value = (lastResponse as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : undefined
}
