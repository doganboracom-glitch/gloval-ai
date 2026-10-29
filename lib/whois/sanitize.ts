/**
 * Turns a raw RDAP domain object into the small, safe record the page shows.
 *
 * This is an allowlist projection: only fields named here are ever read, and
 * the raw JSON never leaves the server. Registrant / administrative / technical
 * contacts (name, e-mail, phone, address) are never read, not even to be
 * discarded later; the only entity looked at is the registrar, and only its
 * formatted business name.
 */

export type DnssecState = 'signed' | 'unsigned' | 'unknown'

export type WhoisRecord = {
  domain: string
  registrar: string | null
  registeredAt: string | null
  updatedAt: string | null
  expiresAt: string | null
  statuses: string[]
  nameservers: string[]
  dnssec: DnssecState
}

/** Canonical status codes (EPP + RDAP values) the page can describe. */
export const STATUS_CODES = [
  'ok', 'active', 'inactive', 'locked', 'validated', 'private', 'obscured', 'proxy', 'removed', 'associated',
  'addPeriod', 'autoRenewPeriod', 'renewPeriod', 'transferPeriod', 'redemptionPeriod',
  'clientDeleteProhibited', 'clientHold', 'clientRenewProhibited', 'clientTransferProhibited', 'clientUpdateProhibited',
  'serverDeleteProhibited', 'serverHold', 'serverRenewProhibited', 'serverTransferProhibited', 'serverUpdateProhibited',
  'deleteProhibited', 'renewProhibited', 'transferProhibited', 'updateProhibited',
  'pendingCreate', 'pendingDelete', 'pendingRenew', 'pendingRestore', 'pendingTransfer', 'pendingUpdate',
] as const
export type StatusCode = (typeof STATUS_CODES)[number]

const STATUS_BY_KEY = new Map<string, StatusCode>(STATUS_CODES.map((code) => [code.toLowerCase(), code]))

/** "client transfer prohibited" and "clientTransferProhibited" both map to the canonical code. */
export function normalizeStatus(value: unknown): StatusCode | null {
  if (typeof value !== 'string' || value.length > 60) return null
  return STATUS_BY_KEY.get(value.toLowerCase().replace(/[^a-z]/g, '')) ?? null
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function sanitizeDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 40) return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return null
  const year = new Date(ms).getUTCFullYear()
  return year >= 1985 && year <= 2200 ? new Date(ms).toISOString() : null
}

function sanitizeRegistrarName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.replace(CONTROL, '').replace(/\s+/g, ' ').trim()
  // A business name never contains an address or e-mail; drop anything that looks personal.
  if (!name || name.length > 120 || /[@<>]/.test(name)) return null
  return name
}

function registrarOf(entities: unknown): string | null {
  if (!Array.isArray(entities)) return null
  for (const entity of entities.slice(0, 30)) {
    const obj = asObject(entity)
    if (!obj || !Array.isArray(obj.roles) || !obj.roles.includes('registrar')) continue
    const vcard = Array.isArray(obj.vcardArray) ? obj.vcardArray[1] : null
    if (!Array.isArray(vcard)) continue
    for (const prop of vcard.slice(0, 40)) {
      if (Array.isArray(prop) && prop[0] === 'fn') return sanitizeRegistrarName(prop[3])
    }
  }
  return null
}

function eventDate(events: unknown, action: string): string | null {
  if (!Array.isArray(events)) return null
  for (const event of events.slice(0, 40)) {
    const obj = asObject(event)
    if (obj && obj.eventAction === action) {
      const date = sanitizeDate(obj.eventDate)
      if (date) return date
    }
  }
  return null
}

export type SanitizeResult = { ok: true; record: WhoisRecord } | { ok: false }

export function sanitizeRdapDomain(raw: unknown, queriedDomain: string): SanitizeResult {
  const root = asObject(raw)
  if (!root || root.objectClassName !== 'domain') return { ok: false }
  // A response about a different name than the one asked for is never shown.
  if (typeof root.ldhName === 'string' && root.ldhName.toLowerCase().replace(/\.$/, '') !== queriedDomain) {
    return { ok: false }
  }

  const statuses: StatusCode[] = []
  if (Array.isArray(root.status)) {
    for (const s of root.status.slice(0, 40)) {
      const code = normalizeStatus(s)
      if (code && !statuses.includes(code)) statuses.push(code)
    }
  }

  const nameservers: string[] = []
  if (Array.isArray(root.nameservers)) {
    for (const ns of root.nameservers.slice(0, 40)) {
      const name = asObject(ns)?.ldhName
      if (typeof name !== 'string') continue
      const host = name.toLowerCase().replace(/\.$/, '')
      if (HOSTNAME.test(host) && !nameservers.includes(host)) nameservers.push(host)
    }
  }
  nameservers.sort()

  const secure = asObject(root.secureDNS)
  const dnssec: DnssecState =
    secure?.delegationSigned === true ? 'signed' : secure?.delegationSigned === false ? 'unsigned' : 'unknown'

  return {
    ok: true,
    record: {
      domain: queriedDomain,
      registrar: registrarOf(root.entities),
      registeredAt: eventDate(root.events, 'registration'),
      updatedAt: eventDate(root.events, 'last changed'),
      expiresAt: eventDate(root.events, 'expiration'),
      statuses,
      nameservers: nameservers.slice(0, 13),
      dnssec,
    },
  }
}
