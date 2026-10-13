import { createHmac, timingSafeEqual } from 'node:crypto'
import { CONTACT_MIN_FILL_MS, CONTACT_TOKEN_MAX_AGE_MS } from '@/lib/site-contact-form'

/**
 * Anti-abuse primitives for the published-site contact form. All pure given a
 * secret, so they are unit-tested without a server.
 */

const TOKEN_DOMAIN = 'site-contact-form:v1'
const IP_DOMAIN = 'site-contact-ip:v1'

function hmac(secret: string, domain: string, payload: string): string {
  return createHmac('sha256', secret).update(`${domain}:${payload}`).digest('hex')
}

/** The server-side secret; the form fails closed (never open) when it is missing. */
export function contactSecret(): string | null {
  const value = process.env.STORE_ORDER_TOKEN_SECRET?.trim()
  return value ? value : null
}

/**
 * Signed render timestamp. The page issues it when it renders the form; the
 * server later proves the form sat on screen long enough and was not forged.
 */
export function signContactToken(secret: string, slug: string, issuedAt: number): string {
  return `${issuedAt}.${hmac(secret, TOKEN_DOMAIN, `${slug}:${issuedAt}`)}`
}

export type ContactTokenCheck = 'ok' | 'invalid' | 'too_fast' | 'expired'

export function verifyContactToken(
  secret: string,
  slug: string,
  token: unknown,
  now: number,
): ContactTokenCheck {
  if (typeof token !== 'string') return 'invalid'
  const [issuedRaw, signature, ...rest] = token.split('.')
  if (rest.length > 0 || !issuedRaw || !signature || !/^\d{10,16}$/.test(issuedRaw)) return 'invalid'
  const issuedAt = Number(issuedRaw)
  const expected = hmac(secret, TOKEN_DOMAIN, `${slug}:${issuedAt}`)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'invalid'
  const age = now - issuedAt
  if (age < CONTACT_MIN_FILL_MS) return 'too_fast'
  if (age > CONTACT_TOKEN_MAX_AGE_MS) return 'expired'
  return 'ok'
}

/** Salted digest of the visitor IP. The raw address is never stored or logged. */
export function hashContactIp(secret: string, ip: string): string {
  return hmac(secret, IP_DOMAIN, ip.trim() || 'unknown')
}

/** The caller IP as the platform proxy reports it (first hop of x-forwarded-for). */
export function clientIpFromHeaders(headers: Pick<Headers, 'get'>): string {
  const forwarded = headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  return first || headers.get('x-real-ip')?.trim() || 'unknown'
}
