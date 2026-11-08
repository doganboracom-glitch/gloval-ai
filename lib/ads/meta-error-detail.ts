/**
 * Safe, allow-list based summary of a Graph API error response.
 *
 * Only diagnostic fields are retained. User text is redacted and bounded; raw response bodies, request headers,
 * credentials, and arbitrary Meta fields are never copied.
 */

export type MetaErrorDetail = {
  code: number | null
  subcode: number | null
  /** e.g. `OAuthException`. */
  type: string | null
  /** Redacted, at most 300 characters. */
  message: string | null
  /** Meta's own user-facing title, redacted. Present only when Meta sent one. */
  userTitle?: string
  /** Meta's own user-facing text (`error_user_msg`), redacted. Present only when Meta sent one. */
  userMessage?: string
  /** Opaque Graph request trace ID, retained for support diagnostics. */
  traceId?: string
  /** Request fields Meta blames (`error_data.blame_field_specs`), allow-listed to simple snake_case names. */
  blameFields?: string[]
}

export const META_ERROR_MESSAGE_LIMIT = 300
export const META_ERROR_DIAGNOSTIC_LIMIT = 300
const TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/
const TRACE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/

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
    .replace(/\b(?:access[-_ ]?token|refresh[-_ ]?token|input[-_ ]?token|token|client[-_ ]?secret|app[-_ ]?secret|appsecret[-_ ]?proof|fb[-_ ]?exchange[-_ ]?token|signed[-_ ]?request|authorization|password|api[-_ ]?key)\b\s*[:=]\s*\S+/gi, '[redacted]')
    .replace(/\bBearer\s+\S+/gi, '[redacted]')
    .replace(/\bEA[A-Za-z0-9]{12,}/g, '[redacted]')
    .replace(/\b\d{5,25}\|[\w-]{10,}/g, '[redacted]')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\+?\d[\d .()-]{6,}\d/g, '[phone]')
    .replace(/\b\d{6,}\b/g, (match, offset, source: string) =>
      /\b(?:code|error_subcode)=$/i.test(source.slice(0, offset)) && match.length <= 9 ? match : '[id]',
    )
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
  const userTitle = redactMetaErrorMessage(error.error_user_title)
  if (userTitle) detail.userTitle = userTitle
  const userMessage = redactMetaErrorMessage(error.error_user_msg)
  if (userMessage) detail.userMessage = userMessage
  if (typeof error.fbtrace_id === 'string' && TRACE_ID_PATTERN.test(error.fbtrace_id)) detail.traceId = error.fbtrace_id
  const blameFields = extractBlameFields(error.error_data)
  if (blameFields.length > 0) detail.blameFields = blameFields
  return detail.code === null && detail.subcode === null && !detail.type && !detail.message && !detail.userTitle && !detail.userMessage && !detail.traceId && !detail.blameFields?.length
    ? null
    : detail
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
    ...(redactMetaErrorMessage(record.userTitle) ? { userTitle: redactMetaErrorMessage(record.userTitle)! } : {}),
    ...(redactMetaErrorMessage(record.userMessage) ? { userMessage: redactMetaErrorMessage(record.userMessage)! } : {}),
    ...(typeof record.traceId === 'string' && TRACE_ID_PATTERN.test(record.traceId) ? { traceId: record.traceId } : {}),
    ...(Array.isArray(record.blameFields) ? { blameFields: record.blameFields.filter((field): field is string => typeof field === 'string' && FIELD_NAME_PATTERN.test(field)).slice(0, 8) } : {}),
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

/** Bounded, redacted diagnostic text for logs and the authenticated publish panel. */
export function formatMetaErrorDiagnostic(detail: MetaErrorDetail | null): string | null {
  if (!detail) return null
  const pieces = [
    detail.code === null ? null : `code=${detail.code}`,
    detail.subcode === null ? null : `error_subcode=${detail.subcode}`,
    detail.type ? `type=${detail.type}` : null,
    detail.traceId ? `fbtrace_id=${detail.traceId}` : null,
    detail.userTitle ? `başlık: ${detail.userTitle}` : null,
    detail.userMessage ? `Meta: ${detail.userMessage}` : null,
    detail.message ? `mesaj: ${detail.message}` : null,
    detail.blameFields?.length ? `alanlar: ${detail.blameFields.join(', ')}` : null,
  ].filter((piece): piece is string => Boolean(piece))
  const text = pieces.join(' | ').slice(0, META_ERROR_DIAGNOSTIC_LIMIT)
  return text || null
}
