import {
  MAX_ALIAS_DESTINATIONS,
  normalizeDestinationAddress,
  validateAliasDestinations,
  type AliasDestinationResult,
} from './alias-destinations'

/**
 * Mailbox-level forwarding, implemented as ONE Sieve filter that Gloval owns.
 *
 * Mailcow stores user filters in `sieve_filters` (add/edit/delete `filter`,
 * read `get/filters/<mailbox>`) and parses the script on write. The filter is
 * recognised by its exact description, so the customer's own filters are never
 * read as ours and never rewritten.
 *
 * Pure and side-effect free so the script format can be unit tested without a
 * mail server.
 */

/** Exact description of the filter Gloval owns. Matched by equality, not prefix. */
export const FORWARD_SCRIPT_DESC = 'gloval-forward'
/** `postfilter` runs after the customer's own Sieve script. */
export const FORWARD_FILTER_TYPE = 'postfilter'
export const MAX_FORWARD_DESTINATIONS = MAX_ALIAS_DESTINATIONS

const REQUIRE_COPY_LINE = 'require ["copy"];'
const QUOTED = '"((?:[^"\\\\]|\\\\["\\\\])*)"'
const COPY_LINE_RE = new RegExp(`^redirect :copy ${QUOTED};$`)
const PLAIN_LINE_RE = new RegExp(`^redirect ${QUOTED};$`)

export type ForwardingSettings = { destinations: string[]; keepCopy: boolean }

/**
 * Same rules as alias destinations (single address, lower-cased, de-duplicated,
 * at most 10, never the mailbox itself). An empty list is valid here and means
 * "turn forwarding off".
 */
export function validateForwardingDestinations(input: {
  mailboxAddress: string
  domain: string
  destinations: unknown
  internalAddresses: ReadonlySet<string> | null
}): AliasDestinationResult {
  if (Array.isArray(input.destinations) && input.destinations.length === 0) {
    return { ok: true, destinations: [] }
  }
  return validateAliasDestinations({
    aliasAddress: input.mailboxAddress,
    domain: input.domain,
    destinations: input.destinations,
    internalAddresses: input.internalAddresses,
  })
}

function escapeSieveString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function unescapeSieveString(value: string): string {
  return value.replace(/\\(["\\])/g, '$1')
}

/**
 * Builds the Sieve script. Throws on anything that is not an already-normalised
 * single address, so an unvalidated string can never reach the script.
 */
export function buildForwardScript(destinations: readonly string[], keepCopy: boolean): string {
  if (destinations.length === 0 || destinations.length > MAX_FORWARD_DESTINATIONS) {
    throw new Error('invalid forward destination count')
  }
  for (const address of destinations) {
    if (normalizeDestinationAddress(address) !== address) throw new Error('invalid forward destination')
  }

  const lines = destinations.map(
    (address) => `redirect${keepCopy ? ' :copy' : ''} "${escapeSieveString(address)}";`,
  )
  if (keepCopy) lines.unshift(REQUIRE_COPY_LINE)
  return `${lines.join('\n')}\n`
}

/**
 * Reads a script back. Returns null for anything that is not exactly the shape
 * `buildForwardScript` produces, so a hand-edited filter is reported as
 * unreadable instead of being half-understood and silently overwritten.
 */
export function parseForwardScript(script: unknown): ForwardingSettings | null {
  if (typeof script !== 'string') return null
  const lines = script
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  if (lines.length === 0) return null

  const keepCopy = lines[0] === REQUIRE_COPY_LINE
  const body = keepCopy ? lines.slice(1) : lines
  const lineRe = keepCopy ? COPY_LINE_RE : PLAIN_LINE_RE
  if (body.length === 0 || body.length > MAX_FORWARD_DESTINATIONS) return null

  const destinations: string[] = []
  for (const line of body) {
    const match = lineRe.exec(line)
    if (!match) return null
    const address = unescapeSieveString(match[1])
    if (normalizeDestinationAddress(address) !== address) return null
    destinations.push(address)
  }
  return { destinations, keepCopy }
}

/** One row of `get/filters/<mailbox>`, reduced to what forwarding needs. */
export type FilterRow = {
  id: string
  active: boolean
  filterType: string
  desc: string
  data: string
}

export function filterRowFromApi(raw: unknown): FilterRow | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.id === undefined || row.id === null || String(row.id) === '') return null
  return {
    id: String(row.id),
    active: row.active === 1 || row.active === '1' || row.active === true,
    filterType: String(row.filter_type ?? ''),
    desc: String(row.script_desc ?? ''),
    data: String(row.script_data ?? ''),
  }
}

export type ForwardingRead =
  | { state: 'none'; owned: FilterRow[]; blocker: FilterRow | null }
  | { state: 'forwarding'; owned: FilterRow[]; blocker: FilterRow | null; settings: ForwardingSettings; active: boolean }
  | { state: 'unreadable'; owned: FilterRow[]; blocker: FilterRow | null }

/**
 * Splits a mailbox's filters into the one Gloval owns and the rest.
 *
 * `blocker` is another ACTIVE postfilter: Mailcow keeps only one active filter
 * per mailbox and filter type, so activating ours would silently switch it off.
 */
export function readForwarding(rows: readonly FilterRow[]): ForwardingRead {
  const owned = rows.filter((row) => row.desc === FORWARD_SCRIPT_DESC)
  const blocker =
    rows.find((row) => row.desc !== FORWARD_SCRIPT_DESC && row.active && row.filterType === FORWARD_FILTER_TYPE) ??
    null

  if (owned.length === 0) return { state: 'none', owned, blocker }

  // Prefer the active copy if a race ever left two behind.
  const primary = owned.find((row) => row.active) ?? owned[0]
  const settings = parseForwardScript(primary.data)
  if (!settings) return { state: 'unreadable', owned, blocker }
  return { state: 'forwarding', owned, blocker, settings, active: primary.active }
}
