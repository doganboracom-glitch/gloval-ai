import type { RegistrantContact } from './types'

/**
 * Safe, structured diagnostics for registrar (DomainNameAPI) failures.
 *
 * The provider's raw HTTP error body is never stored or logged: it is parsed,
 * reduced to a status / code / message / per-field list, and every piece of
 * customer data (contact values, emails, phone-like digit runs) and every
 * secret (API key, reseller username, auth headers) is scrubbed first.
 */

export type RegistrarFieldError = {
  field: string | null
  message: string
}

export type RegistrarDiagnostic = {
  provider: string
  operation: string
  httpStatus: number | null
  providerCode: string | null
  message: string
  fieldErrors: RegistrarFieldError[]
  at: string
}

const MAX_MESSAGE = 240
const MAX_FIELD_ERRORS = 10
const MAX_DEPTH = 5

/** Values below this length are too generic to redact by literal match. */
const MIN_LITERAL = 3

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function collectSensitiveLiterals(contact: RegistrantContact | undefined, extra: Array<string | undefined>): string[] {
  const values: Array<string | undefined> = [...extra]
  if (contact) {
    values.push(
      contact.firstName,
      contact.lastName,
      contact.email,
      contact.phone,
      `${contact.phoneCountryCode}${contact.phone}`,
      contact.addressLine1,
      contact.city,
      contact.zipCode,
      contact.company,
    )
  }
  return Array.from(
    new Set(
      values
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v.length >= MIN_LITERAL),
    ),
  ).sort((a, b) => b.length - a.length)
}

export function createRedactor(contact?: RegistrantContact, secrets: Array<string | undefined> = []) {
  const literals = collectSensitiveLiterals(contact, secrets)
  const literalPatterns = literals.map((value) => new RegExp(escapeRegExp(value), 'gi'))

  return (input: string): string => {
    let out = input
    for (const pattern of literalPatterns) out = out.replace(pattern, '[redacted]')
    out = out
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
      .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
      .replace(
        /\b(api[-_ ]?key|password|passwd|token|secret|authorization)\b\s*["']?\s*[:=]\s*["']?[^\s"',;}]+/gi,
        '$1=[redacted]',
      )
      .replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]')
    return out.replace(/\s+/g, ' ').trim()
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

const MESSAGE_KEYS = ['message', 'Message', 'error_description', 'detail', 'title', 'description', 'Description']
const CODE_KEYS = ['code', 'Code', 'errorCode', 'ErrorCode', 'statusCode']
const NESTED_KEYS = ['error', 'Error', 'errors', 'Errors', 'details', 'Details', 'data', 'fieldErrors', 'validationErrors']

function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

type Extracted = { code: string | null; message: string | null; fields: RegistrarFieldError[] }

function extract(body: unknown, redact: (s: string) => string, depth = 0, fieldHint: string | null = null): Extracted {
  const result: Extracted = { code: null, message: null, fields: [] }
  if (depth > MAX_DEPTH || body == null) return result

  const push = (field: string | null, message: string) => {
    if (result.fields.length >= MAX_FIELD_ERRORS) return
    result.fields.push({ field, message: truncate(redact(message), MAX_MESSAGE) })
  }

  if (typeof body === 'string') {
    if (body.trim()) push(fieldHint, body)
    return result
  }

  if (Array.isArray(body)) {
    for (const item of body) {
      const inner = extract(item, redact, depth + 1, fieldHint)
      result.fields.push(...inner.fields)
      result.code ??= inner.code
      result.message ??= inner.message
      if (result.fields.length >= MAX_FIELD_ERRORS) break
    }
    result.fields = result.fields.slice(0, MAX_FIELD_ERRORS)
    return result
  }

  if (typeof body !== 'object') return result
  const record = body as Record<string, unknown>

  for (const key of CODE_KEYS) {
    const text = asText(record[key])
    if (text) {
      result.code = truncate(redact(text), 64)
      break
    }
  }
  for (const key of MESSAGE_KEYS) {
    const text = asText(record[key])
    if (text) {
      result.message = truncate(redact(text), MAX_MESSAGE)
      break
    }
  }

  for (const key of NESTED_KEYS) {
    const nested = record[key]
    if (nested == null) continue
    if (typeof nested === 'object' && !Array.isArray(nested) && !MESSAGE_KEYS.some((k) => k in (nested as object)) && !CODE_KEYS.some((k) => k in (nested as object))) {
      // Map of field name -> message(s), e.g. { "Registrant.Phone": ["invalid"] }.
      for (const [field, value] of Object.entries(nested as Record<string, unknown>)) {
        const inner = extract(value, redact, depth + 1, field)
        result.fields.push(...inner.fields)
        if (inner.message) result.fields.push({ field, message: inner.message })
      }
    } else {
      const inner = extract(nested, redact, depth + 1, fieldHint)
      result.code ??= inner.code
      result.message ??= inner.message
      result.fields.push(...inner.fields)
    }
  }

  result.fields = result.fields.slice(0, MAX_FIELD_ERRORS)
  return result
}

export type BuildDiagnosticInput = {
  provider: string
  operation: string
  httpStatus?: number | null
  /** Provider envelope code, e.g. "API_400". */
  providerCode?: string | null
  /** Provider envelope message (already part of the SDK's error envelope). */
  providerMessage?: string | null
  /** Parsed provider response body, if the SDK retained one. */
  body?: unknown
  contact?: RegistrantContact
  secrets?: Array<string | undefined>
}

export function statusFromErrorCode(code: string | null | undefined): number | null {
  const match = /^(?:API_|HTTP[ _])?(\d{3})$/.exec(code ?? '')
  return match ? Number(match[1]) : null
}

export function buildRegistrarDiagnostic(input: BuildDiagnosticInput): RegistrarDiagnostic {
  const redact = createRedactor(input.contact, input.secrets)

  let extracted: Extracted = { code: null, message: null, fields: [] }
  try {
    extracted = extract(input.body, redact)
  } catch {
    // An unexpected body shape must never break registration error handling.
  }

  const providerCode = input.providerCode ?? extracted.code
  const rawMessage = extracted.message ?? input.providerMessage ?? 'no_message'

  return {
    provider: input.provider,
    operation: input.operation,
    httpStatus: input.httpStatus ?? statusFromErrorCode(providerCode),
    providerCode: providerCode ? truncate(redact(providerCode), 64) : null,
    message: truncate(redact(rawMessage), MAX_MESSAGE),
    fieldErrors: extracted.fields,
    at: new Date().toISOString(),
  }
}

/**
 * Single-line, human-readable form that is safe to persist in the existing
 * `domain_orders.error_message` text column (no schema change needed) and to
 * show in admin notifications.
 */
export function formatRegistrarDiagnostic(d: RegistrarDiagnostic): string {
  const parts = [
    `${d.provider}:${d.operation}`,
    d.httpStatus != null ? `http=${d.httpStatus}` : null,
    d.providerCode ? `code=${d.providerCode}` : null,
    `msg=${d.message}`,
  ].filter(Boolean)
  const fields = d.fieldErrors.map((f) => (f.field ? `${f.field}: ${f.message}` : f.message)).join(' | ')
  return truncate(fields ? `${parts.join(' ')} fields=[${fields}]` : parts.join(' '), 900)
}
