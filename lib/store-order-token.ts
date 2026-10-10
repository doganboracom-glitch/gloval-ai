import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Signed, expiring access token for the public order page.
 *
 * Format: `<exp>.<signature>` where `exp` is a unix timestamp in seconds and
 * `signature = base64url(HMAC-SHA256(secret, "store-order-access:v1:<orderId>.<exp>"))`.
 * The order id is bound into the signature, so a token never works for another
 * order. The purpose prefix keeps these signatures distinct from any other HMAC
 * made with the same secret (customer session cookies, for instance).
 *
 * Pure functions: the secret and the clock are parameters so they are testable.
 */

export const ORDER_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

const PURPOSE = 'store-order-access:v1'

function sign(orderId: string, exp: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${PURPOSE}:${orderId}.${exp}`)
    .digest('base64url')
}

export function signOrderToken(
  orderId: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  ttlSeconds: number = ORDER_TOKEN_TTL_SECONDS,
): string {
  const exp = nowSeconds + ttlSeconds
  return `${exp}.${sign(orderId, exp, secret)}`
}

export function verifyOrderToken(
  orderId: string,
  token: string | null | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!orderId || !secret || typeof token !== 'string' || token.length > 256) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [expRaw, signature] = parts
  if (!/^\d{1,12}$/.test(expRaw)) return false
  const exp = Number(expRaw)
  if (exp < nowSeconds) return false

  const expected = Buffer.from(sign(orderId, exp, secret))
  const actual = Buffer.from(signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
