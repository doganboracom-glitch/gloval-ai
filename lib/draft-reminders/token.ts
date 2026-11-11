import { createHmac, timingSafeEqual } from 'node:crypto'

const PURPOSE = 'draft-reminders-opt-out:v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SIGNATURE = /^[A-Za-z0-9_-]{43}$/

function secret(): string | null {
  const value = (process.env.DRAFT_REMINDERS_TOKEN_SECRET || process.env.STORE_ORDER_TOKEN_SECRET || '').trim()
  return value.length >= 16 ? value : null
}

function sign(userId: string, key: string): string {
  return createHmac('sha256', key).update(`${PURPOSE}:${userId.toLowerCase()}`).digest('base64url')
}

/**
 * Stateless token that can do exactly one thing: opt this user out of draft
 * reminders. It carries the user id and an HMAC bound to that purpose, so it
 * cannot be replayed against any other endpoint. Returns null when no signing
 * secret is configured (the caller must then not send mail).
 */
export function createOptOutToken(userId: string): string | null {
  const key = secret()
  if (!key || !UUID.test(userId)) return null
  return `${userId.toLowerCase()}.${sign(userId, key)}`
}

/** Returns the user id when the token is authentic, otherwise null. */
export function verifyOptOutToken(token: string): string | null {
  const key = secret()
  if (!key) return null
  const [userId, signature, ...rest] = token.split('.')
  if (rest.length > 0 || !userId || !signature || !UUID.test(userId) || !SIGNATURE.test(signature)) return null
  const expected = Buffer.from(sign(userId, key))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  return userId.toLowerCase()
}
