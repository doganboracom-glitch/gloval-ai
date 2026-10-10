/**
 * Shared shape + length validation for the invoice profile that is stored as
 * jsonb, both for guest checkout (`createOrder`) and for the saved profile of a
 * store customer account. Pure module (no server-only imports) so it can be
 * used by any server code and unit-tested directly.
 */

export const INVOICE_LIMITS = {
  tckn: 20,
  companyName: 200,
  taxOffice: 100,
  taxNumber: 20,
  address: 500,
} as const

export type InvoiceField = keyof typeof INVOICE_LIMITS

export type SanitizedInvoice = Record<string, string>

export type InvoiceResult =
  | { ok: true; value: SanitizedInvoice | null }
  | { ok: false }

/**
 * Normalises untrusted invoice input into the stored jsonb shape, keeping only
 * the fields relevant to the chosen type.
 *
 * - `clamp` (checkout): never rejects; unknown types fall back to individual,
 *   non-string fields become empty and over-long strings are truncated, so an
 *   order is never lost because of an invoice detail.
 * - `strict` (account profile): malformed shapes, unknown types, non-string
 *   fields and over-long strings are rejected.
 *
 * Output semantics match the original checkout normaliser: a corporate invoice
 * with neither a company name nor a tax number is dropped (`null`), and an
 * individual invoice with neither TCKN nor address collapses to
 * `{ type: 'individual' }`.
 */
export function sanitizeInvoice(
  raw: unknown,
  mode: 'clamp' | 'strict',
): InvoiceResult {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return mode === 'strict' ? { ok: false } : { ok: true, value: null }
  }
  const r = raw as Record<string, unknown>

  let type: 'individual' | 'corporate'
  if (r.type === 'corporate') type = 'corporate'
  else if (r.type === 'individual') type = 'individual'
  else if (mode === 'strict') return { ok: false }
  else type = 'individual'

  let failed = false
  const read = (field: InvoiceField): string => {
    const v = r[field]
    if (v === undefined || v === null) return ''
    if (typeof v !== 'string') {
      if (mode === 'strict') failed = true
      return ''
    }
    const trimmed = v.trim()
    if (trimmed.length > INVOICE_LIMITS[field]) {
      if (mode === 'strict') failed = true
      return trimmed.slice(0, INVOICE_LIMITS[field])
    }
    return trimmed
  }

  if (type === 'corporate') {
    const companyName = read('companyName')
    const taxOffice = read('taxOffice')
    const taxNumber = read('taxNumber')
    const address = read('address')
    if (failed) return { ok: false }
    if (!companyName && !taxNumber) return { ok: true, value: null }
    return {
      ok: true,
      value: { type: 'corporate', companyName, taxOffice, taxNumber, address },
    }
  }

  const tckn = read('tckn')
  const address = read('address')
  if (failed) return { ok: false }
  if (!tckn && !address) return { ok: true, value: { type: 'individual' } }
  return { ok: true, value: { type: 'individual', tckn, address } }
}
