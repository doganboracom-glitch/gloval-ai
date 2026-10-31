import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'

export const GOOGLE_OAUTH_STATE_TTL_MS = 15 * 60 * 1000
export const GOOGLE_OAUTH_CALLBACK_COOKIE_PATH = '/api/ads/google/callback'
export const GOOGLE_OAUTH_COOKIE_PREFIX = 'gloval_ads_oauth_'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/

type GoogleOAuthClaims = {
  v: 1
  sub: string
  flow: string
  nonce: string
  exp: number
}

export function createGooglePkcePair() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function createGoogleOAuthState(input: {
  userId: string
  flowId: string
  secret: string
  now?: number
}) {
  if (!UUID_PATTERN.test(input.userId) || !UUID_PATTERN.test(input.flowId) || input.secret.length < 32) {
    throw new GoogleAdsError('configuration_missing')
  }

  const nonce = randomBytes(32).toString('base64url')
  const expiresAt = Math.floor(((input.now ?? Date.now()) + GOOGLE_OAUTH_STATE_TTL_MS) / 1000)
  const claims: GoogleOAuthClaims = {
    v: 1,
    sub: input.userId,
    flow: input.flowId,
    nonce,
    exp: expiresAt,
  }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = createHmac('sha256', input.secret).update(payload).digest('base64url')

  return {
    state: `${payload}.${signature}`,
    nonce,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  }
}

export function verifyGoogleOAuthState(
  state: string,
  secret: string,
  now = Date.now(),
): GoogleOAuthClaims | null {
  if (!state || state.length > 2048 || secret.length < 32) return null
  const [payload, signature, extra] = state.split('.')
  if (!payload || !signature || extra !== undefined) return null

  let suppliedSignature: Buffer
  try {
    suppliedSignature = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  const expectedSignature = createHmac('sha256', secret).update(payload).digest()
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<GoogleOAuthClaims>
    if (
      claims.v !== 1 ||
      typeof claims.sub !== 'string' ||
      !UUID_PATTERN.test(claims.sub) ||
      typeof claims.flow !== 'string' ||
      !UUID_PATTERN.test(claims.flow) ||
      typeof claims.nonce !== 'string' ||
      !NONCE_PATTERN.test(claims.nonce) ||
      typeof claims.exp !== 'number' ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp * 1000 <= now ||
      claims.exp * 1000 > now + GOOGLE_OAUTH_STATE_TTL_MS + 60_000
    ) {
      return null
    }
    return claims as GoogleOAuthClaims
  } catch {
    return null
  }
}

export function readGoogleOAuthFlowId(state: string): string | null {
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

export function hashGoogleOAuthState(state: string): string {
  return createHash('sha256').update(state).digest('hex')
}

export function googleOAuthCookieName(flowId: string): string {
  if (!UUID_PATTERN.test(flowId)) throw new GoogleAdsError('invalid_request')
  return `${GOOGLE_OAUTH_COOKIE_PREFIX}${flowId}`
}

export function secureTextEquals(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}
