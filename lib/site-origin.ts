import { tenantUrl } from '@/lib/domains'
import { isDomainLive, type CustomDomain } from '@/lib/custom-domains/types'

/**
 * Pure helpers that decide which origin a published tenant site advertises in
 * its canonical URL, og:url, sitemap, robots.txt and JSON-LD. No I/O here, so
 * the rules are unit-testable; the lookup lives in `lib/seo/site-seo.ts`.
 */

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/**
 * `https://<host>` for a hostname. Lowercases, drops a port and a trailing dot,
 * and returns null for anything that is not a plausible public hostname so a
 * junk value can never end up inside a canonical tag.
 */
export function siteOrigin(host: string | null | undefined): string | null {
  if (!host) return null
  const normalized = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  return HOST_RE.test(normalized) ? `https://${normalized}` : null
}

/**
 * The domain a site should treat as its primary public address: only domains
 * that are really live (DNS + Vercel + SSL ready) and bound to a project count.
 * The primary flag wins; otherwise the oldest live domain, so the choice is
 * stable between requests.
 */
export function pickCanonicalDomain(domains: readonly CustomDomain[]): CustomDomain | null {
  const live = domains.filter((d) => d.websiteProjectId && isDomainLive(d))
  if (live.length === 0) return null
  return [...live].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
    const byAge = a.createdAt.localeCompare(b.createdAt)
    return byAge !== 0 ? byAge : a.id.localeCompare(b.id)
  })[0]
}

/**
 * Origin a published site advertises. A live custom domain wins; with none (or
 * an unusable host) the behaviour is unchanged: `<slug>.gloval.site`.
 */
export function canonicalOrigin(slug: string, customHost: string | null | undefined): string {
  return siteOrigin(customHost) ?? tenantUrl(slug)
}
