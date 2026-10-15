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
  | 'unavailable'

export type IyzicoHttpOutcome =
  | { ok: true }
  | { ok: false; error: 'rejected' | 'unavailable'; code: string }

/**
 * Classifies an iyzico response by status code ONLY. The body is never read:
 * it may echo personal data, and nothing from it is shown or logged.
 */
export function classifyIyzicoStatus(status: number): IyzicoHttpOutcome {
  if (status >= 200 && status < 300) return { ok: true }
  const code = `iyzico_http_${status}`
  if (status === 400 || status === 409 || status === 422) return { ok: false, error: 'rejected', code }
  return { ok: false, error: 'unavailable', code }
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
