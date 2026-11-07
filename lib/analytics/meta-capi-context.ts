import { isIP } from 'node:net'
import { CONSENT_COOKIE, CONSENT_VERSION } from '@/lib/cookie-consent-storage'
import { isMeasurementSurface } from '@/lib/analytics-config'
import type { MetaCapiContext } from '@/lib/analytics/meta-capi'

type HeaderReader = Pick<Headers, 'get'>

function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null
  for (const entry of cookieHeader.split(';')) {
    const trimmed = entry.trim()
    if (trimmed.startsWith(`${name}=`)) return trimmed.slice(name.length + 1)
  }
  return null
}

/**
 * Server-side reading of the visitor's cookie choice. Missing, malformed or
 * outdated consent is treated as "no marketing consent" (fail closed).
 */
export function hasMarketingConsent(cookieHeader: string | null | undefined): boolean {
  const raw = readCookie(cookieHeader, CONSENT_COOKIE)
  if (!raw) return false
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { v?: number; marketing?: unknown }
    return parsed.v === CONSENT_VERSION && parsed.marketing === true
  } catch {
    return false
  }
}

function sanitizeCookieToken(value: string | null): string | undefined {
  if (!value) return undefined
  const decoded = (() => {
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  })()
  return /^[A-Za-z0-9._-]{1,200}$/.test(decoded) ? decoded : undefined
}

function clientIp(headers: HeaderReader): string | undefined {
  const candidates = [
    headers.get('x-vercel-forwarded-for')?.split(',')[0],
    headers.get('x-forwarded-for')?.split(',')[0],
  ]
  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (value && isIP(value)) return value
  }
  return undefined
}

function originFrom(headers: HeaderReader, fallbackOrigin?: string): string | undefined {
  if (fallbackOrigin) return fallbackOrigin
  const origin = headers.get('origin')
  if (origin) return origin
  const host = headers.get('x-forwarded-host') ?? headers.get('host')
  if (!host) return undefined
  const proto = headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/**
 * Event page: the referrer when it is a measured platform page, otherwise the
 * site root. Auth routes are deliberately never reported as a source URL.
 */
export function resolveSourceUrl(headers: HeaderReader, fallbackOrigin?: string): string | undefined {
  const referer = headers.get('referer')
  if (referer) {
    try {
      const url = new URL(referer)
      if (isMeasurementSurface(url.hostname, url.pathname)) return `${url.origin}${url.pathname}`
    } catch {
      // Fall through to the origin.
    }
  }
  const origin = originFrom(headers, fallbackOrigin)
  return origin ? `${origin.replace(/\/$/, '')}/` : undefined
}

/**
 * Builds the CAPI context from the incoming request. IP, user agent and the
 * `_fbp`/`_fbc` cookies are only copied when marketing consent is present, so
 * a consent-less request carries no identifiers at all.
 */
export function buildCapiContext(headers: HeaderReader, options: { fallbackOrigin?: string } = {}): MetaCapiContext {
  const cookieHeader = headers.get('cookie')
  if (!hasMarketingConsent(cookieHeader)) return { marketingConsent: false }
  return {
    marketingConsent: true,
    ip: clientIp(headers),
    userAgent: headers.get('user-agent')?.slice(0, 500) || undefined,
    fbp: sanitizeCookieToken(readCookie(cookieHeader, '_fbp')),
    fbc: sanitizeCookieToken(readCookie(cookieHeader, '_fbc')),
    sourceUrl: resolveSourceUrl(headers, options.fallbackOrigin),
  }
}
