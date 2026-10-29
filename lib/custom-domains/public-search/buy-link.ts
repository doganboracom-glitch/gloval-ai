import { sanitizeNextPath } from '@/lib/safe-redirect'
import { parsePublicDomain } from './validate'

/**
 * Hand-off from the public search to the in-dashboard purchase dialog. The only
 * thing that travels is a validated domain (label + supported extension), so the
 * `next` value is always a fixed same-site path and can never be used as an open
 * redirect.
 */

export const DOMAINS_PATH = '/dashboard/domains'

/** `/dashboard/domains?buy=marka.com`, or null when the domain is not a clean supported one. */
export function buildDomainBuyPath(domain: string): string | null {
  const parsed = parsePublicDomain(domain)
  return parsed ? `${DOMAINS_PATH}?buy=${encodeURIComponent(parsed.domain)}` : null
}

export function buildBuyHref(domain: string, authenticated: boolean, auth: 'sign-up' | 'login' = 'sign-up'): string {
  const path = buildDomainBuyPath(domain)
  if (!path) return DOMAINS_PATH
  if (authenticated) return path
  return `/auth/${auth}?next=${encodeURIComponent(sanitizeNextPath(path, DOMAINS_PATH))}`
}

/** Reads the `?buy=` value the dashboard receives; anything not a clean supported domain is ignored. */
export function parseBuyParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  return parsePublicDomain(value)?.domain ?? null
}
