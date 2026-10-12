import { timingSafeEqual } from 'node:crypto'
import { hmacBase64Url } from '@/lib/store-customer-keys'

/**
 * Signed store-customer session cookie: creation, parsing and the DB-backed
 * check. Kept free of `next/headers` and the database client so the exact same
 * validation is shared by every reader (server actions, pages, the
 * `/api/store/session` route) and can be unit tested.
 *
 * The cookie is host-only on purpose (no `Domain`): it is written on whichever
 * host the customer signs in on (gloval.ai/site/<slug>, <slug>.gloval.site or a
 * custom domain) and is only ever read back on that same host.
 */

export const COOKIE_PREFIX = 'store_customer_'
export const SESSION_TTL_DAYS = 30
export const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000

function sign(value: string): string {
  return hmacBase64Url('session', `session|${value}`)
}

/** Session version derived from the row's `password_changed_at` (0 if unset). */
export function sessionVersion(row: { password_changed_at?: string | null }): number {
  const t = row.password_changed_at ? Date.parse(row.password_changed_at) : NaN
  return Number.isFinite(t) ? t : 0
}

export function makeToken(
  customerId: string,
  projectId: string,
  version: number,
  now: number = Date.now(),
): string {
  const exp = now + SESSION_TTL_MS
  const payload = `${customerId}.${projectId}.${exp}.${version}`
  return `${payload}.${sign(payload)}`
}

export function parseToken(
  token: string | undefined,
): { customerId: string; projectId: string; version: number } | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 5) return null
  const [customerId, projectId, expStr, versionStr, sig] = parts
  const payload = `${customerId}.${projectId}.${expStr}.${versionStr}`
  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(sig)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null
  }
  if (!(Number(expStr) >= Date.now())) return null
  const version = Number(versionStr)
  if (!Number.isFinite(version)) return null
  return { customerId, projectId, version }
}

export function cookieName(projectId: string): string {
  return `${COOKIE_PREFIX}${projectId.slice(0, 8)}`
}

/**
 * Resolves the customer a cookie value belongs to for ONE project: the
 * signature and expiry must be valid, the token must have been issued for this
 * project, and its password version must equal the row's current one.
 */
export async function authenticateSessionToken<
  Row extends { password_changed_at?: string | null; deleted_at?: string | null },
>(
  token: string | undefined,
  projectId: string,
  findCustomerById: (projectId: string, customerId: string) => Promise<Row | null>,
): Promise<Row | null> {
  const parsed = parseToken(token)
  if (!parsed || parsed.projectId !== projectId) return null
  const row = await findCustomerById(projectId, parsed.customerId)
  if (!row || row.deleted_at || sessionVersion(row) !== parsed.version) return null
  return row
}
