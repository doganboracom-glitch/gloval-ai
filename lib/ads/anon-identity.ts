import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { resolveAnonHashSecret } from '@/lib/ads/env'

/**
 * Anonymous visitor cookie of GLOVAL Ads. Value: `<id>.<issuedAtSeconds>.<signature>`
 * where the signature is an HMAC under a key derived from `ADS_ANON_HASH_SECRET`
 * with a domain label, so a cookie signature can never be replayed as the IP or
 * cookie hash of the quota subjects. The cookie is issued by `GET /api/ads/session`
 * when the /ads page loads, so the first form submission already carries it.
 */

export const ADS_ANON_COOKIE = 'gloval_ads_anon'
export const ADS_ANON_COOKIE_PATH = '/api/ads'
export const ADS_ANON_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

const CLOCK_SKEW_SECONDS = 60
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/

type Env = Readonly<Record<string, string | undefined>>

function signingKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('ads-anon-cookie:v1').digest()
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', signingKey(secret)).update(payload).digest('base64url').slice(0, 32)
}

export type IssuedAnonCookie = { id: string; value: string }

/** A fresh cookie, or null when the secret is missing (the caller must fail closed). */
export function issueAnonCookie(env: Env = process.env, nowMs: number = Date.now()): IssuedAnonCookie | null {
  const secret = resolveAnonHashSecret(env)
  if (!secret) return null
  const id = randomBytes(16).toString('base64url')
  const payload = `${id}.${Math.floor(nowMs / 1000)}`
  return { id, value: `${payload}.${sign(secret, payload)}` }
}

export type AnonCookieCheck =
  | { status: 'valid'; id: string }
  | { status: 'missing' | 'invalid' }
  | { status: 'unconfigured' }

export function verifyAnonCookie(
  value: string | undefined | null,
  env: Env = process.env,
  nowMs: number = Date.now(),
): AnonCookieCheck {
  const secret = resolveAnonHashSecret(env)
  if (!secret) return { status: 'unconfigured' }
  if (!value) return { status: 'missing' }
  const parts = value.split('.')
  if (parts.length !== 3) return { status: 'invalid' }
  const [id, issued, signature] = parts
  if (!ID_PATTERN.test(id) || !/^\d{9,11}$/.test(issued)) return { status: 'invalid' }

  const expected = Buffer.from(sign(secret, `${id}.${issued}`))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { status: 'invalid' }

  const issuedAt = Number(issued)
  const nowSeconds = Math.floor(nowMs / 1000)
  if (issuedAt > nowSeconds + CLOCK_SKEW_SECONDS) return { status: 'invalid' }
  if (nowSeconds - issuedAt > ADS_ANON_COOKIE_MAX_AGE_SECONDS) return { status: 'invalid' }
  return { status: 'valid', id }
}
