export const REFERRAL_COOKIE_NAME = 'gloval_referral'
export const REFERRAL_SIGNUP_INTENT_COOKIE_NAME = 'gloval_referral_signup_intent'
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 60
export const REFERRAL_SIGNUP_INTENT_TTL_SECONDS = 10 * 60

export function referralCookieOptions(maxAge: number) {
  return { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge }
}
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{8,16}$/

const VERSION = 'v1' as const
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MIN_SECRET_LENGTH = 32

export type ReferralEnvironment = {
  [key: string]: string | undefined
  REFERRAL_ENABLED?: string
  REFERRAL_COOKIE_HMAC_ACTIVE_VERSION?: string
  REFERRAL_COOKIE_HMAC_KEY_V1?: string
  REFERRAL_CLICK_HMAC_KEY_V1?: string
}

export type ReferralSignupSource = 'email' | 'oauth'

export type ReferralCookieClaims = {
  partnerId: string
  referralCode: string
  capturedAt: number
  expiresAt: number
  version: typeof VERSION
}

export type ReferralSignupIntentClaims = {
  issuedAt: number
  expiresAt: number
  nonce: string
  source: ReferralSignupSource
  version: typeof VERSION
}

type SignedClaims = Record<string, unknown> & { version: typeof VERSION }

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null
  try {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const binary = atob(padded)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

function activeVersion(env: ReferralEnvironment): typeof VERSION | null {
  const value = env.REFERRAL_COOKIE_HMAC_ACTIVE_VERSION?.trim().toLowerCase()
  return value === '1' || value === VERSION ? VERSION : null
}

function cookieSecret(version: string, env: ReferralEnvironment): string | null {
  if (version !== VERSION) return null
  const secret = env.REFERRAL_COOKIE_HMAC_KEY_V1?.trim()
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null
}

function clickSecret(env: ReferralEnvironment): string | null {
  const secret = env.REFERRAL_CLICK_HMAC_KEY_V1?.trim()
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null
}

export function isReferralFeatureEnabled(env: ReferralEnvironment = process.env): boolean {
  return env.REFERRAL_ENABLED === '1'
}

export function isReferralRuntimeReady(env: ReferralEnvironment = process.env): boolean {
  const version = activeVersion(env)
  return Boolean(
    isReferralFeatureEnabled(env) &&
      version &&
      cookieSecret(version, env) &&
      clickSecret(env),
  )
}

export function normalizeReferralCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase()
  return normalized && REFERRAL_CODE_PATTERN.test(normalized) ? normalized : null
}

async function hmac(secret: string, value: string): Promise<Uint8Array | null> {
  try {
    const cryptoApi = globalThis.crypto
    if (!cryptoApi?.subtle) return null
    const key = await cryptoApi.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    return new Uint8Array(await cryptoApi.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
  } catch {
    return null
  }
}

async function sha256Hex(value: string): Promise<string | null> {
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

async function signClaims(
  claims: SignedClaims,
  purpose: string,
  env: ReferralEnvironment,
): Promise<string | null> {
  const secret = cookieSecret(claims.version, env)
  if (!secret) return null
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(claims)))
  const signature = await hmac(secret, `gloval:${purpose}:${claims.version}:${payload}`)
  return signature ? `${payload}.${encodeBase64Url(signature)}` : null
}

async function verifyClaims<T extends SignedClaims>(
  token: string | null | undefined,
  purpose: string,
  env: ReferralEnvironment,
): Promise<T | null> {
  if (!token || token.length > 2048) return null
  const separator = token.indexOf('.')
  if (separator <= 0 || separator !== token.lastIndexOf('.')) return null
  const payloadPart = token.slice(0, separator)
  const signaturePart = token.slice(separator + 1)
  const payloadBytes = decodeBase64Url(payloadPart)
  const signatureBytes = decodeBase64Url(signaturePart)
  if (!payloadBytes || !signatureBytes) return null

  let claims: unknown
  try {
    claims = JSON.parse(new TextDecoder().decode(payloadBytes))
  } catch {
    return null
  }
  if (!claims || typeof claims !== 'object' || !('version' in claims)) return null
  const version = (claims as { version?: unknown }).version
  if (version !== VERSION) return null
  const secret = cookieSecret(version, env)
  if (!secret) return null

  try {
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const valid = await globalThis.crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      new TextEncoder().encode(`gloval:${purpose}:${version}:${payloadPart}`),
    )
    return valid ? (claims as T) : null
  } catch {
    return null
  }
}

export async function createReferralCookieToken(
  input: { partnerId: string; referralCode: string; capturedAt?: number },
  env: ReferralEnvironment = process.env,
): Promise<string | null> {
  if (!isReferralRuntimeReady(env) || !UUID_PATTERN.test(input.partnerId)) return null
  const referralCode = normalizeReferralCode(input.referralCode)
  if (!referralCode) return null

  const version = activeVersion(env)
  if (!version) return null
  const capturedAt = input.capturedAt ?? Date.now()
  const claims = {
    purpose: 'referral-cookie',
    version,
    partnerId: input.partnerId,
    referralCode,
    capturedAt,
    expiresAt: capturedAt + REFERRAL_COOKIE_MAX_AGE_SECONDS * 1000,
  } satisfies SignedClaims
  return signClaims(claims, 'referral-cookie', env)
}

export async function verifyReferralCookieToken(
  token: string | null | undefined,
  now = Date.now(),
  env: ReferralEnvironment = process.env,
): Promise<ReferralCookieClaims | null> {
  if (!isReferralRuntimeReady(env)) return null
  const claims = await verifyClaims<ReferralCookieClaims & { purpose?: string }>(
    token,
    'referral-cookie',
    env,
  )
  if (
    !claims ||
    claims.purpose !== 'referral-cookie' ||
    !UUID_PATTERN.test(claims.partnerId) ||
    !normalizeReferralCode(claims.referralCode) ||
    normalizeReferralCode(claims.referralCode) !== claims.referralCode ||
    !Number.isSafeInteger(claims.capturedAt) ||
    !Number.isSafeInteger(claims.expiresAt) ||
    claims.capturedAt > now ||
    claims.expiresAt <= now ||
    claims.expiresAt - claims.capturedAt > REFERRAL_COOKIE_MAX_AGE_SECONDS * 1000
  ) {
    return null
  }
  return claims
}

export async function hashReferralClickSubject(
  ip: string | null | undefined,
  now = Date.now(),
  env: ReferralEnvironment = process.env,
): Promise<string | null> {
  if (!isReferralRuntimeReady(env)) return null
  const secret = clickSecret(env)
  const normalizedIp = ip?.trim()
  if (!secret || !normalizedIp || normalizedIp.length > 128) return null
  const day = new Date(now).toISOString().slice(0, 10)
  const digest = await hmac(secret, `gloval:referral-click:v1:${day}:${normalizedIp}`)
  return digest
    ? Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
    : null
}

export async function createReferralSignupIntent(
  source: 'email' | 'oauth',
  now = Date.now(),
  env: ReferralEnvironment = process.env,
): Promise<{ token: string; intentHash: string; issuedAt: number; expiresAt: number } | null> {
  if (!isReferralRuntimeReady(env)) return null
  const version = activeVersion(env)
  if (!version || !globalThis.crypto?.getRandomValues) return null

  const nonceBytes = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const nonce = encodeBase64Url(nonceBytes)
  const issuedAt = now
  const expiresAt = now + REFERRAL_SIGNUP_INTENT_TTL_SECONDS * 1000
  const claims = {
    purpose: 'referral-signup-intent',
    version,
    issuedAt,
    expiresAt,
    nonce,
    source,
  } satisfies SignedClaims
  const token = await signClaims(claims, 'referral-signup-intent', env)
  const intentHash = await sha256Hex(nonce)
  return token && intentHash ? { token, intentHash, issuedAt, expiresAt } : null
}

export async function verifyReferralSignupIntent(
  token: string | null | undefined,
  now = Date.now(),
  env: ReferralEnvironment = process.env,
): Promise<ReferralSignupIntentClaims | null> {
  if (!isReferralRuntimeReady(env)) return null
  const claims = await verifyClaims<ReferralSignupIntentClaims & { purpose?: string }>(
    token,
    'referral-signup-intent',
    env,
  )
  if (
    !claims ||
    claims.purpose !== 'referral-signup-intent' ||
    typeof claims.nonce !== 'string' ||
    !/^[A-Za-z0-9_-]{40,64}$/u.test(claims.nonce) ||
    (claims.source !== 'email' && claims.source !== 'oauth') ||
    !Number.isSafeInteger(claims.issuedAt) ||
    !Number.isSafeInteger(claims.expiresAt) ||
    claims.issuedAt > now ||
    claims.expiresAt <= now ||
    claims.expiresAt - claims.issuedAt > REFERRAL_SIGNUP_INTENT_TTL_SECONDS * 1000
  ) {
    return null
  }
  return claims
}

export async function hashReferralSignupNonce(nonce: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/u.test(nonce)) return null
  return sha256Hex(nonce)
}
