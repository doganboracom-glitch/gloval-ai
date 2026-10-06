import { createAdminClient } from '@/lib/supabase/admin'
import { getDomainProvider } from './provider'
import { normalizePageRequest, pageCount, type DomainPage } from './pagination'
import { DomainError, isDomainLive, isDomainUsable, type CustomDomain } from './types'

/**
 * The single read layer for custom domains.
 *
 * Everything that needs to know about a customer's domains — the domains UI,
 * the email module, and later the website publishing flow — goes through here
 * instead of querying a provider (or Supabase) directly. UI components never
 * talk to the data layer themselves.
 */

/** Every domain belonging to a user, primary first. */
export async function listDomainsForUser(userId: string): Promise<CustomDomain[]> {
  return getDomainProvider().listDomains(userId)
}

/**
 * One page of a user's inventory. A page past the end (rows were removed since
 * the client last looked) is clamped to the last real page instead of rendering
 * as an empty list next to a non-zero total.
 */
export async function listDomainsPageForUser(
  userId: string,
  request: { page?: unknown; pageSize?: unknown } = {},
): Promise<DomainPage> {
  const provider = getDomainProvider()
  const { page, pageSize } = normalizePageRequest(request)
  const first = await provider.listDomainsPage(userId, { page, pageSize })
  const lastPage = pageCount(first.total, pageSize)
  if (page <= lastPage) return { ...first, page, pageSize }
  const last = await provider.listDomainsPage(userId, { page: lastPage, pageSize })
  return { ...last, page: lastPage, pageSize }
}

/**
 * Fetch a domain and assert the caller owns it.
 *
 * Ownership is checked against the resolved session user, so a guessed or
 * enumerated `domainId` in a URL or request body cannot expose another tenant's
 * domain. Throws FORBIDDEN for both "not found" and "not yours" so the two are
 * indistinguishable to a caller probing ids.
 */
export async function getOwnedDomain(userId: string, domainId: string): Promise<CustomDomain> {
  const domain = await getDomainProvider().getDomain(domainId)
  if (!domain || domain.userId !== userId) throw new DomainError('FORBIDDEN')
  return domain
}

/** The user's primary domain, or their first, or null. */
export async function getPrimaryDomain(userId: string): Promise<CustomDomain | null> {
  const domains = await listDomainsForUser(userId)
  return domains.find((d) => d.isPrimary) ?? domains[0] ?? null
}

/**
 * Domains that have passed verification and may actually carry a website or
 * mail. This is the shared definition of "usable" both products rely on.
 */
export async function listUsableDomainsForUser(userId: string): Promise<CustomDomain[]> {
  return (await listDomainsForUser(userId)).filter(isDomainUsable)
}

/** Admin-facing: every domain across all tenants. */
export async function listAllDomains(): Promise<CustomDomain[]> {
  return getDomainProvider().listDomains()
}

/** True when a real DNS-verifying provider is wired up (vs. the mock stub). */
export function isLiveDomainProvider(): boolean {
  return getDomainProvider().verifiesForReal
}

/**
 * Cross-tenant lookup for an incoming Host header, used ONLY by middleware to
 * route a bring-your-own domain to its bound website.
 *
 * Deliberately admin-scoped: an anonymous visitor hitting a foreign domain has
 * no session to own-check against, so this is the one place a domain is read
 * without a `userId`. It is also deliberately strict — a domain must be fully
 * `active` (DNS-verified) AND have an explicit `websiteProjectId` bound via
 * `bindMyDomainWebsite`. Anything less (pending, failed, disabled, or active
 * but never bound to a site) returns null, so the caller falls through to
 * ordinary platform handling rather than ever rendering a partial or
 * unverified tenant site on someone else's domain.
 */
export async function resolveActiveDomainForHost(host: string): Promise<CustomDomain | null> {
  const normalized = host.toLowerCase().trim().replace(/:\d+$/, '')
  if (!normalized) return null
  try {
    const provider = getDomainProvider()
    // The apex is the stored name; `www.` is served as its companion.
    let found = await provider.findActiveByHost(normalized)
    if (!found && normalized.startsWith('www.')) {
      found = await provider.findActiveByHost(normalized.slice(4))
    }
    // Ownership alone is not enough: DNS, Vercel and SSL must all be ready.
    return found && found.websiteProjectId && isDomainLive(found) ? found : null
  } catch (error) {
    // Fail closed: a lookup error must never break the request, it just means
    // the host falls through to normal platform handling.
    console.log('[v0] resolveActiveDomainForHost failed:', error)
    return null
  }
}

/**
 * Resolves a project id to its published slug, for middleware's rewrite target
 * after `resolveActiveDomainForHost` has already established an active
 * binding. Admin-scoped for the same reason as above (no visitor session to
 * check against), and deliberately narrow: it returns a slug ONLY for a
 * currently published project, never for a draft — so unpublishing a site
 * immediately stops it from being reachable through a bound custom domain too.
 *
 * Queries Supabase directly (bypassing `lib/projects.ts`) so middleware's
 * import graph stays edge-light instead of pulling in that module's full
 * server-action surface (billing, store-sync, admin-guard, ...).
 */
export async function getPublishedSlugForProjectId(projectId: string): Promise<string | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('projects')
    .select('slug, published')
    .eq('id', projectId)
    .maybeSingle()
  if (!data || !data.published || !data.slug) return null
  return data.slug as string
}
