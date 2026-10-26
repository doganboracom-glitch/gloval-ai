import { createHmac, randomBytes } from 'node:crypto'

/** Fixed host: the onboarding endpoint is never caller-controlled. */
export const IYZICO_ONBOARDING_URL = 'https://onboarding.iyzipay.com/api/v1/merchants'

export const MAX_NAME_LENGTH = 80
export const MAX_EMAIL_LENGTH = 254

/** Identifies the exact consent wording shown in the card; recorded with every request. */
export const IYZICO_INSTANT_CONSENT_VERSION = 'instant-consent-v1'

/**
 * Campaign disclosure shown on the card ONLY while the campaign flag is on
 * (IYZICO_INSTANT_SHOW_CAMPAIGN=true). The wording mirrors iyzico's written
 * terms: single-installment Turkish-card transactions only, valid for the go-live
 * month plus the next 3 months. It must never be shortened or reworded to imply
 * the rate is unlimited in time or covers other transactions.
 */
export const IYZICO_CAMPAIGN_COPY = {
  tr: "iyzico kampanyası: 7 gün vade ve %2,29 komisyon oranı; yalnızca tek çekim, Türk kartı işlemleri için, canlıya geçilen ay ve sonraki 3 ay geçerlidir. Kampanya koşulları iyzico'ya aittir ve iyzico tarafından değiştirilebilir.",
  en: 'iyzico campaign: 7-day settlement and a 2.29% commission rate; applies only to single-installment, Turkish card transactions, for the month of going live and the following 3 months. Campaign terms belong to iyzico and may be changed by iyzico.',
} as const

/** Separate flag (default OFF): only the exact string "true" turns the campaign copy on. */
export function isIyzicoCampaignEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.IYZICO_INSTANT_SHOW_CAMPAIGN === 'true'
}

export const IYZICO_INSTANT_LIMITS = {
  /** Max submitted + failed attempts per store inside the window. */
  perProject: 2,
  /** Max submitted + failed attempts per user inside the window. */
  perUser: 5,
  windowMs: 24 * 60 * 60 * 1000,
  /** A reservation without a final HTTP status younger than this is treated as in flight. */
  inFlightMs: 2 * 60 * 1000,
} as const

export type IyzicoInstantError =
  | 'invalid_name'
  | 'invalid_email'
  | 'invalid_phone'
  | 'consent_required'
  | 'already_submitted'
  | 'in_progress'
  | 'rate_limited'
  | 'rejected'
  | 'email_exists'
  | 'config_error'
  | 'unavailable'

export type IyzicoHttpOutcome =
  | { ok: true }
  | { ok: false; error: 'rejected' | 'unavailable'; code: string }

/**
 * Classifies an iyzico response by HTTP status ONLY. Used as the fallback when
 * the body carries no error code; see classifyIyzicoResponse for the full rule.
 */
export function classifyIyzicoStatus(status: number): IyzicoHttpOutcome {
  if (status >= 200 && status < 300) return { ok: true }
  const code = `iyzico_http_${status}`
  if (status === 400 || status === 409 || status === 422) return { ok: false, error: 'rejected', code }
  return { ok: false, error: 'unavailable', code }
}

/** iyzico errorCode: an account already exists for this e-mail address. */
export const IYZICO_ERROR_EMAIL_EXISTS = '132052'
/** iyzico errorCode: empty credential / bad signature, i.e. OUR configuration. */
export const IYZICO_ERROR_CREDENTIALS = '1203'

export type IyzicoResponseOutcome =
  | { ok: true; shape: string[] }
  | {
      ok: false
      error: 'rejected' | 'unavailable' | 'email_exists' | 'config_error'
      /** Safe to log: a fixed token or a sanitized iyzico errorCode, never body text. */
      code: string
      shape: string[]
    }

const MAX_SHAPE_KEYS = 40
const SAFE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/
const SAFE_CODE = /^[A-Za-z0-9_-]{1,20}$/

/**
 * The key NAMES of a JSON body (never values), two levels deep, for logging the
 * shape of a response whose format is not documented. Keys that do not look like
 * plain identifiers are dropped so a data-keyed map can never leak a value.
 */
export function sanitizeResponseShape(body: unknown): string[] {
  const keys: string[] = []
  const visit = (value: unknown, prefix: string, depth: number) => {
    if (keys.length >= MAX_SHAPE_KEYS || value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      if (depth < 2 && value.length > 0) visit(value[0], `${prefix}[]`, depth + 1)
      return
    }
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (keys.length >= MAX_SHAPE_KEYS) return
      if (!SAFE_KEY.test(key)) continue
      const path = prefix ? `${prefix}.${key}` : key
      keys.push(path)
      if (depth < 2) visit((value as Record<string, unknown>)[key], path, depth + 1)
    }
  }
  visit(body, '', 0)
  return keys
}

function readErrorCode(body: Record<string, unknown>): string | null {
  const raw = body.errorCode
  if (raw === undefined || raw === null || raw === '') return null
  const text = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : 'present'
  if (!text) return null
  return SAFE_CODE.test(text) ? text : 'unparsable'
}

/**
 * Decides the outcome from the HTTP status AND the body. An HTTP 2xx is a
 * success only if the body does not say status "failure" and carries no
 * errorCode. A body errorCode is mapped regardless of the HTTP status. A body
 * that is empty or not JSON falls back to the HTTP status alone.
 */
export function classifyIyzicoResponse(status: number, bodyText: string): IyzicoResponseOutcome {
  let parsed: unknown = null
  const trimmed = bodyText.trim()
  if (trimmed) {
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      parsed = null
    }
  }
  const shape = sanitizeResponseShape(parsed)
  const body =
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null

  const errorCode = body ? readErrorCode(body) : null
  const failed = body !== null && typeof body.status === 'string' && body.status.toLowerCase() === 'failure'

  if (errorCode === IYZICO_ERROR_EMAIL_EXISTS) {
    return { ok: false, error: 'email_exists', code: `iyzico_error_${errorCode}`, shape }
  }
  if (errorCode === IYZICO_ERROR_CREDENTIALS) {
    return { ok: false, error: 'config_error', code: `iyzico_error_${errorCode}_credentials`, shape }
  }
  if (errorCode) {
    return { ok: false, error: 'rejected', code: `iyzico_error_${errorCode}`, shape }
  }

  const http = classifyIyzicoStatus(status)
  if (!http.ok) return { ...http, shape }
  if (failed) return { ok: false, error: 'rejected', code: 'iyzico_body_failure', shape }
  return { ok: true, shape }
}

export type IyzicoInstantInput = {
  firstName: string
  lastName: string
  email: string
  phone: string
}

export type IyzicoInstantField = 'name' | 'email' | 'phone'

export type IyzicoInstantPayload = {
  contactName: string
  contactSurname: string
  registrationEmail: string
  gsmNumber: string
}

/**
 * Normalizes Turkish mobile numbers to `+905XXXXXXXXX`. Accepts `05..`, `5..`,
 * `905..`, `+905..`, `00905..` with spaces, dashes, dots or parentheses.
 */
export function normalizeIyzicoPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const compact = value.trim().replace(/[\s().-]/g, '')
  const digits = compact.startsWith('+') ? compact.slice(1) : compact
  if (!/^\d+$/.test(digits)) return null
  if (compact.startsWith('+') && !digits.startsWith('90')) return null
  const national = digits.replace(/^(?:0090|90|0)/, '')
  return /^5\d{9}$/.test(national) ? `+90${national}` : null
}

export function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

export function isValidEmail(value: string): boolean {
  return value.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export type IyzicoInstantValidation =
  | { ok: true; payload: IyzicoInstantPayload }
  | { ok: false; error: 'invalid_name' | 'invalid_email' | 'invalid_phone' }

export function validateIyzicoInstantInput(input: IyzicoInstantInput): IyzicoInstantValidation {
  const firstName = cleanName(input?.firstName)
  const lastName = cleanName(input?.lastName)
  if (
    !firstName ||
    !lastName ||
    firstName.length > MAX_NAME_LENGTH ||
    lastName.length > MAX_NAME_LENGTH
  ) {
    return { ok: false, error: 'invalid_name' }
  }
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!isValidEmail(email)) return { ok: false, error: 'invalid_email' }
  const gsmNumber = normalizeIyzicoPhone(input?.phone)
  if (!gsmNumber) return { ok: false, error: 'invalid_phone' }
  return {
    ok: true,
    payload: {
      contactName: firstName,
      contactSurname: lastName,
      registrationEmail: email,
      gsmNumber,
    },
  }
}

/** HMAC-SHA256 (key: saltKey) over `${developerKey}|${applicationName}|${randomKey}`, lowercase hex. */
export function signIyzicoInstant(
  developerKey: string,
  applicationName: string,
  randomKey: string,
  saltKey: string,
): string {
  return createHmac('sha256', saltKey)
    .update(`${developerKey}|${applicationName}|${randomKey}`)
    .digest('hex')
}

export function buildIyzicoInstantHeaders(creds: {
  developerKey: string
  applicationName: string
  saltKey: string
}): Record<string, string> {
  const randomKey = randomBytes(16).toString('hex')
  return {
    'content-type': 'application/json',
    'x-iyzi-rnd': randomKey,
    'x-iyzi-app-name': creds.applicationName,
    'x-iyzi-developer-key-v2': signIyzicoInstant(
      creds.developerKey,
      creds.applicationName,
      randomKey,
      creds.saltKey,
    ),
  }
}

export function readIyzicoInstantCredentials(
  env: Record<string, string | undefined> = process.env,
): { developerKey: string; applicationName: string; saltKey: string } | null {
  const developerKey = env.IYZICO_INSTANT_DEVELOPER_KEY
  const applicationName = env.IYZICO_INSTANT_APP_NAME
  const saltKey = env.IYZICO_INSTANT_SALT_KEY
  if (!developerKey || !applicationName || !saltKey) return null
  return { developerKey, applicationName, saltKey }
}
