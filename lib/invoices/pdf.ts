import { ARCHIVE_FOLDER, INVOICE_MAX_BYTES, UNASSIGNED_FOLDER } from '@/lib/invoices/constants'

export type PdfError = 'invalid_input' | 'too_large' | 'unsupported_type' | 'active_content'

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-
const FORBIDDEN_TOKENS = ['/JavaScript', '/Launch']

/**
 * Checks the real bytes, never the declared MIME type or extension: size, the
 * `%PDF-` signature at offset 0, and (best effort) the absence of script or
 * launch actions. Objects hidden inside compressed object streams cannot be
 * seen here; the file is only ever served as a download, never rendered
 * inline, which is the real defence.
 */
export function inspectPdf(bytes: Uint8Array): { ok: true } | { ok: false; error: PdfError } {
  if (bytes.length === 0) return { ok: false, error: 'invalid_input' }
  if (bytes.length > INVOICE_MAX_BYTES) return { ok: false, error: 'too_large' }
  if (bytes.length < 8 || !PDF_MAGIC.every((byte, index) => bytes[index] === byte)) {
    return { ok: false, error: 'unsupported_type' }
  }
  const text = new TextDecoder('latin1').decode(bytes)
  if (FORBIDDEN_TOKENS.some((token) => text.includes(token))) return { ok: false, error: 'active_content' }
  return { ok: true }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Keeps only the base name of what the browser reported; it is a label, never a path. */
export function sanitizeUploadedFileName(raw: unknown): string {
  const source = typeof raw === 'string' ? raw : ''
  const base = source.split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim()
  const withExtension = /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned || 'fatura'}.pdf`
  if (withExtension.length <= 200) return withExtension
  return `${withExtension.slice(0, 196).replace(/\.+$/, '')}.pdf`
}

/** Name offered to whoever downloads the file; derived from the invoice number, not from the upload. */
export function downloadFileName(invoiceNumber: string): string {
  const safe = invoiceNumber.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return `Gloval-Fatura-${safe || 'belge'}.pdf`
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const INVOICE_PATH = new RegExp(`^(${UUID}|${UNASSIGNED_FOLDER})/${UUID}\\.pdf$`)

export function invoiceStoragePath(userId: string | null, fileId: string): string {
  return `${userId ?? UNASSIGNED_FOLDER}/${fileId}.pdf`
}

export function isInvoiceStoragePath(path: unknown): path is string {
  return typeof path === 'string' && INVOICE_PATH.test(path)
}

const ARCHIVE_PATH = new RegExp(`^${ARCHIVE_FOLDER}/${UUID}-\\d{10,11}\\.pdf$`)

/** `_archived/<invoice_id>-<unix_ts>.pdf`; deliberately not matched by `isInvoiceStoragePath`, so it can never be signed for download. */
export function archiveStoragePath(invoiceId: string, unixSeconds: number): string {
  return `${ARCHIVE_FOLDER}/${invoiceId}-${Math.floor(unixSeconds)}.pdf`
}

export function isArchiveStoragePath(path: unknown): path is string {
  return typeof path === 'string' && ARCHIVE_PATH.test(path)
}
