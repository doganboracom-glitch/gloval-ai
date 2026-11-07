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
  /** Meta's own user-facing text (`error_user_msg`), redacted. Present only when Meta sent one. */
  userMessage?: string
  /** Request fields Meta blames (`error_data.blame_field_specs`), allow-listed to simple snake_case names. */
  blameFields?: string[]
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
  const userMessage = redactMetaErrorMessage(error.error_user_msg)
  if (userMessage) detail.userMessage = userMessage
  const blameFields = extractBlameFields(error.error_data)
  if (blameFields.length > 0) detail.blameFields = blameFields
  return detail.code === null && detail.subcode === null && !detail.type && !detail.message ? null : detail
}

const FIELD_NAME_PATTERN = /^[a-z][a-z0-9_]{0,59}$/

function extractBlameFields(errorData: unknown): string[] {
  let data = errorData
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return []
    }
  }
  const specs = asRecord(data)?.blame_field_specs
  if (!Array.isArray(specs)) return []
  const fields = new Set<string>()
  for (const spec of specs) {
    for (const name of Array.isArray(spec) ? spec : [spec]) {
      if (typeof name === 'string' && FIELD_NAME_PATTERN.test(name)) fields.add(name)
      if (fields.size >= 8) return [...fields]
    }
  }
  return [...fields]
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

export const META_APP_NOT_LIVE_SUBCODE = 1885183
export const META_APP_NOT_LIVE_MESSAGE =
  'Meta uygulaması henüz canlı modda değil. Yönetici uygulamayı Canlı moda aldıktan sonra Devam et\'e basın.'

/** Meta rejects writes from an app still in development mode (error_subcode 1885183). */
export function isMetaAppNotLive(detail: Pick<MetaErrorDetail, 'subcode' | 'message' | 'userMessage'> | null | undefined): boolean {
  if (!detail) return false
  if (detail.subcode === META_APP_NOT_LIVE_SUBCODE) return true
  return /development mode|geliştirme modu/i.test(`${detail.userMessage ?? ''} ${detail.message ?? ''}`)
}

/** Short, token-free one-liner for logs and the admin panel (`code/subcode type`). */
export function formatMetaErrorCode(detail: MetaErrorDetail | null): string {
  if (!detail) return 'unknown'
  const code = detail.code === null ? '?' : String(detail.code)
  const subcode = detail.subcode === null ? '' : `/${detail.subcode}`
  return `${code}${subcode}${detail.type ? ` ${detail.type}` : ''}`
}
