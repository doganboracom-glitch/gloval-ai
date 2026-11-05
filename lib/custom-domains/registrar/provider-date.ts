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
const ISO_SHAPE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?/
// 0001-01-01 is the provider's "never happened" placeholder (e.g. transferDate).
const PLACEHOLDER = /^0001-01-01/

export function parseProviderDate(value: unknown): ProviderDate {
  if (typeof value !== 'string') return { raw: null, instant: null, zone: 'none' }
  const raw = value.trim()
  if (!raw || PLACEHOLDER.test(raw)) return { raw: null, instant: null, zone: 'none' }
  if (!ISO_SHAPE.test(raw) || !EXPLICIT_ZONE.test(raw)) return { raw, instant: null, zone: 'unknown' }

  // V8 only guarantees millisecond fractions; trim longer ones before parsing.
  const normalized = raw.replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T').replace(/(\.\d{3})\d+/, '$1')
  const time = Date.parse(normalized)
  if (!Number.isFinite(time)) return { raw, instant: null, zone: 'unknown' }
  return { raw, instant: new Date(time).toISOString(), zone: 'explicit' }
}

export type AssumedProviderDate = {
  raw: string | null
  /** UTC ISO-8601 instant, or null when the value is absent or not understood. */
  instant: string | null
  /** How `instant` was obtained; null when there is no instant. */
  source: 'provider_explicit' | 'assumed_istanbul' | null
  /** True when the raw value carried no time-of-day, so end of day was used. */
  dateOnly: boolean
}

// Turkey has observed a fixed UTC+3 since September 2016 and the registrar only
// reports present/future expiry dates, so a constant offset is exact here.
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000

const WALL_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/
const WALL_DOTTED = /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/
const WALL_SLASH = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/
const DOTTED_PLACEHOLDER = /^01\.01\.0001/
const SLASH_PLACEHOLDER = /^01\/01\/0001/

function istanbulWallToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string | null {
  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > 31) return null
  if (hour > 23 || minute > 59 || second > 59) return null
  const wall = Date.UTC(year, month - 1, day, hour, minute, second)
  const check = new Date(wall)
  // Rejects overflow such as 2027-02-31 that Date.UTC would silently roll over.
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null
  }
  return new Date(wall - ISTANBUL_OFFSET_MS).toISOString()
}

/**
 * Istanbul-assuming counterpart of `parseProviderDate` for registrar fields
 * whose zone-less wall-clock format is known to use Europe/Istanbul.
 *
 * A value that names its own zone is converted exactly like the strict parser.
 * A zone-less value is read as Europe/Istanbul wall-clock time and labelled
 * `assumed_istanbul`; a date with no time-of-day resolves to 23:59:59 Istanbul.
 *
 * Use only for non-monetary registration-age checks and display. Renewal and
 * payment verification keep the strict rule that a zone-less value is not an instant.
 */
export function parseProviderDateAssumingIstanbul(value: unknown): AssumedProviderDate {
  const none: AssumedProviderDate = { raw: null, instant: null, source: null, dateOnly: false }
  if (typeof value !== 'string') return none
  const raw = value.trim()
  if (!raw || PLACEHOLDER.test(raw) || DOTTED_PLACEHOLDER.test(raw) || SLASH_PLACEHOLDER.test(raw)) return none

  const strict = parseProviderDate(raw)
  if (strict.instant) return { raw, instant: strict.instant, source: 'provider_explicit', dateOnly: false }

  const iso = WALL_ISO.exec(raw)
  const dotted = iso ? null : WALL_DOTTED.exec(raw)
  const slash = iso || dotted ? null : WALL_SLASH.exec(raw)
  const parts = iso
    ? { y: iso[1], m: iso[2], d: iso[3], h: iso[4], min: iso[5], s: iso[6] }
    : dotted
      ? { y: dotted[3], m: dotted[2], d: dotted[1], h: dotted[4], min: dotted[5], s: dotted[6] }
      : slash
        ? { y: slash[3], m: slash[2], d: slash[1], h: slash[4], min: slash[5], s: slash[6] }
        : null
  if (!parts) return { raw, instant: null, source: null, dateOnly: false }

  const dateOnly = parts.h === undefined
  const instant = istanbulWallToInstant(
    Number(parts.y),
    Number(parts.m),
    Number(parts.d),
    dateOnly ? 23 : Number(parts.h),
    dateOnly ? 59 : Number(parts.min),
    dateOnly ? 59 : Number(parts.s ?? 0),
  )
  if (!instant) return { raw, instant: null, source: null, dateOnly }
  return { raw, instant, source: 'assumed_istanbul', dateOnly }
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
  if (!lastResponse || typeof lastResponse !== 'object' || Array.isArray(lastResponse)) return undefined
  const response = lastResponse as Record<string, unknown>
  const exactValue = response[field]
  if (typeof exactValue === 'string') return exactValue

  const normalizedField = field.toLowerCase()
  for (const [key, value] of Object.entries(response)) {
    if (key.toLowerCase() === normalizedField && typeof value === 'string') return value
  }
  return undefined
}

export function readFirstRawField(lastResponse: unknown, fields: readonly string[]): string | undefined {
  for (const field of fields) {
    const value = readRawField(lastResponse, field)
    if (value !== undefined && value.trim()) return value
  }
  return undefined
}
