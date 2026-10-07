import type { MailAlias, MailErrorCode } from './types'

/**
 * Pure helpers for turning Mailcow alias rows into `MailAlias` and for
 * classifying "already exists" failures. No I/O, so they are unit-testable
 * without a Mailcow server.
 */

type Row = Record<string, unknown>

/**
 * Mailcow returns `active` as a number (1/0) on most versions, but a string
 * ("1"/"0") or boolean on others. Only an explicit "off" value means inactive;
 * a missing value is treated as active so a row is never wrongly shown as Pasif.
 */
export function parseActive(value: unknown): boolean {
  if (value === 0 || value === false) return false
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    return !(v === '0' || v === 'false' || v === 'off' || v === 'no')
  }
  return true
}

export function splitGoto(goto: unknown): string[] {
  const parts = Array.isArray(goto) ? goto.map(String) : String(goto ?? '').split(',')
  return parts.map((s) => s.trim()).filter(Boolean)
}

/** Mailcow stores every mailbox as an alias pointing at itself; those are not user aliases. */
export function isMailboxSelfRow(row: Row): boolean {
  const address = String(row.address ?? '').trim().toLowerCase()
  const goto = splitGoto(row.goto).map((g) => g.toLowerCase())
  return goto.length === 1 && goto[0] === address
}

/**
 * Keep only the rows that belong to `domain` (matched on the address suffix, so
 * this is correct whether Mailcow filtered by domain server-side or returned
 * every domain), drop mailbox self-rows, and ignore rows without an id/address.
 */
export function selectAliasRows(rows: unknown, domain: string): Row[] {
  if (!Array.isArray(rows)) return []
  const suffix = `@${domain.trim().toLowerCase()}`
  return (rows as Row[]).filter((row) => {
    if (!row || typeof row !== 'object') return false
    if (row.id === undefined || row.id === null || !row.address) return false
    if (!String(row.address).trim().toLowerCase().endsWith(suffix)) return false
    return !isMailboxSelfRow(row)
  })
}

export function aliasFromRow(row: Row, domainId: string): MailAlias {
  return {
    id: String(row.id),
    domainId,
    address: String(row.address),
    destinations: splitGoto(row.goto),
    active: parseActive(row.active),
    createdAt: String(row.created || new Date().toISOString()),
  }
}

/**
 * Decide which "already exists" the user should see. The provider's live lists
 * are authoritative; the Mailcow message is only the tie-breaker. Returns null
 * when the failure does not look like a conflict at all.
 */
export function classifyAliasConflict(input: {
  message: string
  address: string
  mailboxAddresses: Iterable<string>
  aliasAddresses: Iterable<string>
}): Extract<MailErrorCode, 'ALIAS_EXISTS' | 'ADDRESS_IS_MAILBOX'> | null {
  const address = input.address.trim().toLowerCase()
  const has = (list: Iterable<string>) => [...list].some((a) => a.trim().toLowerCase() === address)

  if (has(input.mailboxAddresses)) return 'ADDRESS_IS_MAILBOX'
  if (has(input.aliasAddresses)) return 'ALIAS_EXISTS'

  if (!/exist|already|duplicate|is_alias|is_mailbox/i.test(input.message)) return null
  if (/mailbox/i.test(input.message) && !/alias/i.test(input.message)) return 'ADDRESS_IS_MAILBOX'
  return 'ALIAS_EXISTS'
}
