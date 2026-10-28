'use client'

import { useSelectedLayoutSegment } from 'next/navigation'
import { CookieConsent } from '@/components/cookie-consent'

/**
 * Root-layout slot of the cookie card (`variant="platform"`).
 *
 * Published customer sites render their own card from the tenant layout
 * (`app/site/[slug]/layout.tsx`, `variant="site"`). The root layout wraps both,
 * so it steps aside when the matched route tree is the tenant one. This reads
 * the route tree (the same tree a subdomain / custom-domain rewrite resolves
 * to), never the hostname or the visible URL, so exactly one card exists per
 * page and it can never be the wrong variant.
 */
export const TENANT_ROUTE_SEGMENT = 'site'

export function PlatformCookieConsent() {
  const segment = useSelectedLayoutSegment()
  if (segment === TENANT_ROUTE_SEGMENT) return null
  return <CookieConsent variant="platform" />
}
