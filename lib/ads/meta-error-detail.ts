/**
 * Safe, allow-list based summary of a Graph API error response.
 *
 * Only the numeric code/subcode, the error type and a short redacted message survive. The raw response body,
 * request headers, `fbtrace_id` and credentials are never copied, so the result is safe to log and store.
 */

export type MetaErrorDetail = {
  code: number | null
  subcode: number | null
  /** e.g. `OAuthException`. */
  type: string | null
  /** Redacted, at most 200 characters. Diagnostics only; never shown to end users. */
  message: string | null
}

export const META_ERROR_MESSAGE_LIMIT = 200
const TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/

export type MetaErrorClass =
  | 'reauth_required'
  | 'permission_missing'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'provider_error'

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80004])
const REAUTH_CODES = new Set([102, 190])
const TRANSIENT_CODES = new Set([1, 2])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function safeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 999_999_999 ? value : null
}

/** Strips anything that looks like a credential, address or identifier, then truncates. */
export function redactMetaErrorMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\b(?:access[-_ ]?token|input[-_ ]?token|client[-_ ]?secret|app[-_ ]?secret|fb[-_ ]?exchange[-_ ]?token|signed[-_ ]?request|authorization|code)\b\s*[:=]\s*\S+/gi, '[redacted]')
    .replace(/\bBearer\s+\S+/gi, '[redacted]')
    .replace(/\bEA[A-Za-z0-9]{12,}/g, '[redacted]')
    .replace(/\b\d{5,25}\|[\w-]{10,}/g, '[redacted]')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\d{6,}/g, '[id]')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned ? cleaned.slice(0, META_ERROR_MESSAGE_LIMIT) : null
}

/** Extracts a safe summary from a Graph error payload (`{ error: { code, error_subcode, type, message } }`). */
export function extractMetaErrorDetail(payload: unknown): MetaErrorDetail | null {
  const error = asRecord(asRecord(payload)?.error)
  if (!error) return null
  const type = typeof error.type === 'string' && TYPE_PATTERN.test(error.type) ? error.type : null
  const detail: MetaErrorDetail = {
    code: safeInteger(error.code),
    subcode: safeInteger(error.error_subcode),
    type,
    message: redactMetaErrorMessage(error.message),
  }
  return detail.code === null && detail.subcode === null && !detail.type && !detail.message ? null : detail
}

/** Re-validates an already-extracted detail (e.g. read back from storage). */
export function sanitizeMetaErrorDetail(value: unknown): MetaErrorDetail | null {
  const record = asRecord(value)
  if (!record) return null
  return {
    code: safeInteger(record.code),
    subcode: safeInteger(record.subcode),
    type: typeof record.type === 'string' && TYPE_PATTERN.test(record.type) ? record.type : null,
    message: redactMetaErrorMessage(record.message),
  }
}

export function classifyMetaError(httpStatus: number, detail: MetaErrorDetail | null): MetaErrorClass {
  const code = detail?.code ?? null
  if (code !== null && REAUTH_CODES.has(code)) return 'reauth_required'
  if (code !== null && (code === 10 || (code >= 200 && code <= 299))) return 'permission_missing'
  if (code !== null && RATE_LIMIT_CODES.has(code)) return 'rate_limited'
  if (httpStatus === 429) return 'rate_limited'
  if (httpStatus === 401) return 'reauth_required'
  if (httpStatus >= 500 || (code !== null && TRANSIENT_CODES.has(code))) return 'provider_unavailable'
  return 'provider_error'
}

/** Short, token-free one-liner for logs and the admin panel (`code/subcode type`). */
export function formatMetaErrorCode(detail: MetaErrorDetail | null): string {
  if (!detail) return 'unknown'
  const code = detail.code === null ? '?' : String(detail.code)
  const subcode = detail.subcode === null ? '' : `/${detail.subcode}`
  return `${code}${subcode}${detail.type ? ` ${detail.type}` : ''}`
}
