import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { platformUrl } from '@/lib/domains'
import { iyzicoReturnPath } from '@/lib/store-payments/iyzico-constants'

/**
 * The per-order callback address handed to iyzico. It carries the order id, a
 * single-use nonce (also stored on the order and cleared once the payment is
 * settled) and an HMAC over both, so the return endpoint can reject forged or
 * replayed calls before it ever asks iyzico anything.
 */

const PURPOSE = 'store-iyzico-return:v1'

export function newReturnNonce(): string {
  return randomBytes(16).toString('hex')
}

function sign(orderId: string, nonce: string, secret: string): string {
  return createHmac('sha256', secret).update(`${PURPOSE}:${orderId}.${nonce}`).digest('base64url')
}

export function buildReturnUrl(projectId: string, orderId: string, nonce: string, secret: string): string {
  const query = new URLSearchParams({ o: orderId, n: nonce, s: sign(orderId, nonce, secret) })
  return `${platformUrl(iyzicoReturnPath(projectId))}?${query.toString()}`
}

export function verifyReturnParams(
  params: { o: string | null; n: string | null; s: string | null },
  secret: string,
): { orderId: string; nonce: string } | null {
  const { o, n, s } = params
  if (!secret || !o || !n || !s || o.length > 64 || n.length > 64 || s.length > 128) return null
  const expected = Buffer.from(sign(o, n, secret))
  const actual = Buffer.from(s)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  return { orderId: o, nonce: n }
}

/** Constant-time equality for the stored nonce. */
export function nonceMatches(stored: string | null | undefined, given: string): boolean {
  if (!stored) return false
  const a = Buffer.from(stored)
  const b = Buffer.from(given)
  return a.length === b.length && timingSafeEqual(a, b)
}
