import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

/**
 * Pure PayTR helpers for STORE (tenant) payments, taken with the store
 * owner's OWN PayTR account. Deliberately separate from `lib/payments/paytr.ts`,
 * which uses Gloval's platform keys for subscriptions. No I/O, no env access,
 * so everything here is unit-testable.
 */

export const PAYTR_GET_TOKEN_URL = 'https://www.paytr.com/odeme/api/get-token'
export const PAYTR_FRAME_BASE = 'https://www.paytr.com/odeme/guvenli/'
/** Minutes PayTR keeps the payment page open (`timeout_limit`). */
export const PAYTR_TIMEOUT_MINUTES = 30

export type PaytrCredentials = {
  merchantId: string
  merchantKey: string
  merchantSalt: string
  testMode: boolean
}

export type PaytrTokenFields = {
  merchantId: string
  userIp: string
  merchantOid: string
  email: string
  /** Amount in kuruş (integer, already multiplied by 100). */
  paymentAmount: number
  /** base64(JSON) basket, exactly as sent. */
  userBasket: string
  noInstallment: number
  maxInstallment: number
  currency: string
  testMode: boolean
}

/** PayTR `merchant_oid` must be alphanumeric: strip every non-alphanumeric char. */
export function toMerchantOid(orderId: string): string {
  return orderId.replace(/[^A-Za-z0-9]/g, '')
}

/**
 * iFrame API step-1 token:
 * base64(HMAC_SHA256(merchant_id + user_ip + merchant_oid + email +
 * payment_amount + user_basket + no_installment + max_installment + currency +
 * test_mode + merchant_salt, merchant_key))
 */
export function computeTokenHash(fields: PaytrTokenFields, merchantSalt: string, merchantKey: string): string {
  const input =
    fields.merchantId +
    fields.userIp +
    fields.merchantOid +
    fields.email +
    String(fields.paymentAmount) +
    fields.userBasket +
    String(fields.noInstallment) +
    String(fields.maxInstallment) +
    fields.currency +
    (fields.testMode ? '1' : '0') +
    merchantSalt
  return createHmac('sha256', merchantKey).update(input).digest('base64')
}

/** Callback hash: base64(HMAC_SHA256(merchant_oid + merchant_salt + status + total_amount, merchant_key)). */
export function computeCallbackHash(
  fields: { merchantOid: string; status: string; totalAmount: string },
  merchantSalt: string,
  merchantKey: string,
): string {
  return createHmac('sha256', merchantKey)
    .update(fields.merchantOid + merchantSalt + fields.status + fields.totalAmount)
    .digest('base64')
}

/** Constant-time comparison of the received and expected callback hash. */
export function verifyCallbackHash(
  fields: { merchantOid: string; status: string; totalAmount: string; hash: string },
  merchantSalt: string,
  merchantKey: string,
): boolean {
  const expected = Buffer.from(computeCallbackHash(fields, merchantSalt, merchantKey))
  const received = Buffer.from(fields.hash ?? '')
  if (expected.length !== received.length) return false
  return timingSafeEqual(expected, received)
}

export type PaytrCallback = {
  merchantOid: string
  status: 'success' | 'failed'
  totalAmount: string
  hash: string
}

/** Parses the form-encoded callback body; null when a signed field is missing/odd. */
export function parsePaytrCallbackBody(rawBody: string): PaytrCallback | null {
  const params = new URLSearchParams(rawBody)
  const merchantOid = params.get('merchant_oid') ?? ''
  const status = params.get('status') ?? ''
  const totalAmount = params.get('total_amount') ?? ''
  const hash = params.get('hash') ?? ''
  if (!/^[A-Za-z0-9]{1,64}$/.test(merchantOid)) return null
  if (status !== 'success' && status !== 'failed') return null
  if (!/^\d{1,12}$/.test(totalAmount)) return null
  if (!hash || hash.length > 128) return null
  return { merchantOid, status, totalAmount, hash }
}

export type BasketLine = { name: string; unitPriceCents: number; quantity: number }

/** `user_basket`: base64 of JSON `[[name, "18.00", qty], ...]`. */
export function buildUserBasket(lines: BasketLine[]): string {
  const rows = lines.map((l) => [
    l.name.replace(/\s+/g, ' ').trim().slice(0, 100) || 'Urun',
    (l.unitPriceCents / 100).toFixed(2),
    l.quantity,
  ])
  return Buffer.from(JSON.stringify(rows), 'utf8').toString('base64')
}

/** PayTR currency code for an order currency; null when PayTR cannot take it. */
export function toPaytrCurrency(currency: string): string | null {
  const up = currency.trim().toUpperCase()
  if (up === 'TRY' || up === 'TL') return 'TL'
  if (up === 'EUR' || up === 'USD' || up === 'GBP' || up === 'RUB') return up
  return null
}

/**
 * Client IP from trusted proxy headers. Vercel overwrites
 * `x-vercel-forwarded-for` / `x-real-ip` / the first `x-forwarded-for` entry,
 * so they are tried in that order. Returns null when no valid address exists.
 */
export function pickClientIp(get: (name: string) => string | null | undefined): string | null {
  const candidates = [
    get('x-vercel-forwarded-for'),
    get('x-real-ip'),
    (get('x-forwarded-for') ?? '').split(',')[0],
  ]
  for (const raw of candidates) {
    const value = (raw ?? '').trim().replace(/^::ffff:/i, '')
    if (value && isIP(value)) return value
  }
  return null
}

export type TokenFailure = 'invalid_credentials' | 'rejected'

/**
 * Maps a PayTR `reason` string to a coarse code. The raw reason is never
 * forwarded to callers: it can echo request data.
 */
export function classifyTokenFailure(reason: unknown): TokenFailure {
  const text = typeof reason === 'string' ? reason.toLowerCase() : ''
  if (/paytr_token|hash|merchant_id|magaza|mağaza|merchant|token/.test(text)) return 'invalid_credentials'
  return 'rejected'
}

/** Short, non-reversible fingerprint of a credential set (used to bind a connection test). */
export function credentialFingerprint(c: PaytrCredentials): string {
  return createHash('sha256')
    .update(['paytr', c.merchantId, c.merchantKey, c.merchantSalt, c.testMode ? '1' : '0'].join('\u0000'))
    .digest('hex')
}

/** Masks a stored secret for display: bullets plus the last two characters. */
export function maskSecret(secret: string | null | undefined): string | null {
  if (!secret) return null
  return secret.length >= 8 ? `••••••${secret.slice(-2)}` : '••••••'
}

export type PaytrFieldErrors = Partial<Record<'merchantId' | 'merchantKey' | 'merchantSalt', string>>

/**
 * Validates owner input. Key/salt may be blank when one is already stored.
 * Returns trimmed values plus per-field error codes.
 */
export function validatePaytrInput(
  input: { merchantId: string; merchantKey: string; merchantSalt: string },
  stored: { hasKey: boolean; hasSalt: boolean },
): { values: { merchantId: string; merchantKey: string; merchantSalt: string }; errors: PaytrFieldErrors } {
  const values = {
    merchantId: (input.merchantId ?? '').trim(),
    merchantKey: (input.merchantKey ?? '').trim(),
    merchantSalt: (input.merchantSalt ?? '').trim(),
  }
  const errors: PaytrFieldErrors = {}
  if (!values.merchantId) errors.merchantId = 'required'
  else if (!/^[A-Za-z0-9]{3,20}$/.test(values.merchantId)) errors.merchantId = 'invalid'

  const secret = (value: string, hasStored: boolean): string | undefined => {
    if (!value) return hasStored ? undefined : 'required'
    if (/\s/.test(value) || value.length < 8 || value.length > 128) return 'invalid'
    return undefined
  }
  const keyError = secret(values.merchantKey, stored.hasKey)
  const saltError = secret(values.merchantSalt, stored.hasSalt)
  if (keyError) errors.merchantKey = keyError
  if (saltError) errors.merchantSalt = saltError
  return { values, errors }
}
