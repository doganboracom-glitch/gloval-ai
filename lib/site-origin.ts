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
 * True when the hosting provider reports that this hostname answers with a
 * redirect to a different host (e.g. `www.firma.com` -> `firma.com`, 308). Such
 * a host serves no content, so advertising it as canonical would point search
 * engines at a URL that only redirects.
 */
export function redirectsElsewhere(domain: Pick<CustomDomain, 'domain' | 'redirectTo'>): boolean {
  const target = domain.redirectTo
  if (!target) return false
  const host = target
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/:].*$/, '')
    .replace(/\.$/, '')
  return host !== '' && host !== domain.domain.toLowerCase()
}

/**
 * The domain a site should treat as its primary public address: only domains
 * that are really live (DNS + Vercel + SSL ready), bound to a project, and that
 * actually serve content (do not redirect to another host) count. Among those
 * the primary flag wins; otherwise the oldest, so the choice is stable between
 * requests. If every live domain redirects, there is no content-serving custom
 * domain and the caller falls back to the tenant subdomain.
 */
export function pickCanonicalDomain(domains: readonly CustomDomain[]): CustomDomain | null {
  const live = domains.filter((d) => d.websiteProjectId && isDomainLive(d) && !redirectsElsewhere(d))
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
