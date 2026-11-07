import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'

export const META_OAUTH_STATE_TTL_MS = 15 * 60 * 1000
export const META_OAUTH_CALLBACK_COOKIE_PATH = '/api/ads/meta/callback'
export const META_OAUTH_COOKIE_PREFIX = 'gloval_ads_meta_oauth_'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/

export type MetaOAuthClaims = {
  v: 1
  /** Audience tag: a Google OAuth state can never be replayed here. */
  aud: 'meta'
  sub: string
  flow: string
  nonce: string
  exp: number
}

export function createMetaOAuthState(input: { userId: string; flowId: string; secret: string; now?: number }) {
  if (!UUID_PATTERN.test(input.userId) || !UUID_PATTERN.test(input.flowId) || input.secret.length < 32) {
    throw new MetaAdsError('configuration_missing')
  }
  const nonce = randomBytes(32).toString('base64url')
  const expiresAt = Math.floor(((input.now ?? Date.now()) + META_OAUTH_STATE_TTL_MS) / 1000)
  const claims: MetaOAuthClaims = { v: 1, aud: 'meta', sub: input.userId, flow: input.flowId, nonce, exp: expiresAt }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = createHmac('sha256', input.secret).update(payload).digest('base64url')
  return { state: `${payload}.${signature}`, nonce, expiresAt: new Date(expiresAt * 1000).toISOString() }
}

export function verifyMetaOAuthState(state: string, secret: string, now = Date.now()): MetaOAuthClaims | null {
  if (!state || state.length > 2048 || secret.length < 32) return null
  const [payload, signature, extra] = state.split('.')
  if (!payload || !signature || extra !== undefined) return null

  const supplied = Buffer.from(signature, 'base64url')
  const expected = createHmac('sha256', secret).update(payload).digest()
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<MetaOAuthClaims>
    if (
      claims.v !== 1 ||
      claims.aud !== 'meta' ||
      typeof claims.sub !== 'string' || !UUID_PATTERN.test(claims.sub) ||
      typeof claims.flow !== 'string' || !UUID_PATTERN.test(claims.flow) ||
      typeof claims.nonce !== 'string' || !NONCE_PATTERN.test(claims.nonce) ||
      typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) ||
      claims.exp * 1000 <= now ||
      claims.exp * 1000 > now + META_OAUTH_STATE_TTL_MS + 60_000
    ) {
      return null
    }
    return claims as MetaOAuthClaims
  } catch {
    return null
  }
}

/** Reads the flow id without verifying the signature; only used to pick the cookie to clear. */
export function readMetaOAuthFlowId(state: string): string | null {
  if (!state || state.length > 2048) return null
  const payload = state.split('.')[0]
  if (!payload) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { flow?: unknown }
    return typeof claims.flow === 'string' && UUID_PATTERN.test(claims.flow) ? claims.flow : null
  } catch {
    return null
  }
}

export function hashMetaOAuthState(state: string): string {
  return createHash('sha256').update(state).digest('hex')
}

export function metaOAuthCookieName(flowId: string): string {
  if (!UUID_PATTERN.test(flowId)) throw new MetaAdsError('invalid_request')
  return `${META_OAUTH_COOKIE_PREFIX}${flowId}`
}

export function metaTokenContext(userId: string, flowId: string) {
  return { userId, platform: 'meta', externalAccountId: `oauth:${flowId}` }
}

export function secureMetaTextEquals(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}
