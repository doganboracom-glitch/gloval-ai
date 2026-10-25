import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Signed "the owner already chose FREE" intent. The billing screen issues it
 * when the owner presses "FREE ile yayınla" and the editor route verifies it
 * server-side, so the FREE / packages dialog is not asked a second time.
 *
 * It only skips the dialog. Every limit is still enforced by `publishProject`,
 * so a replayed or shared link cannot publish anything FREE would refuse.
 */

const DOMAIN = 'free-chosen-intent:v1'
export const FREE_CHOSEN_MAX_AGE_MS = 15 * 60 * 1000

export function freeChosenSecret(): string | null {
  const value = process.env.STORE_ORDER_TOKEN_SECRET?.trim()
  return value ? value : null
}

function sign(secret: string, projectId: string, userId: string, expiresAt: number): string {
  return createHmac('sha256', secret)
    .update(`${DOMAIN}:${projectId}:${userId}:${expiresAt}`)
    .digest('base64url')
}

export function signFreeChosenIntent(
  secret: string,
  projectId: string,
  userId: string,
  now: number,
): string {
  const expiresAt = now + FREE_CHOSEN_MAX_AGE_MS
  return `${expiresAt}.${sign(secret, projectId, userId, expiresAt)}`
}

export function verifyFreeChosenIntent(
  secret: string | null,
  projectId: string,
  userId: string,
  token: unknown,
  now: number,
): boolean {
  if (!secret || typeof token !== 'string') return false
  const [expiresRaw, signature, ...rest] = token.split('.')
  if (rest.length > 0 || !expiresRaw || !signature || !/^\d{10,16}$/.test(expiresRaw)) return false
  const expiresAt = Number(expiresRaw)
  if (now > expiresAt) return false
  const expected = Buffer.from(sign(secret, projectId, userId, expiresAt))
  const given = Buffer.from(signature)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
