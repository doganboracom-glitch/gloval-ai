import { createHmac, randomBytes } from 'node:crypto'

/** Fixed host: the onboarding endpoint is never caller-controlled. */
export const IYZICO_ONBOARDING_URL = 'https://onboarding.iyzipay.com/api/v1/merchants'

export const MAX_NAME_LENGTH = 80
export const MAX_EMAIL_LENGTH = 254

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
