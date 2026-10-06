/**
 * Centralized domain architecture for GLOVAL.
 *
 *   gloval.ai       → canonical main GLOVAL AI platform (marketing, dashboard, editor)
 *   www.gloval.ai   → alias, redirects to the canonical apex
 *   gloval.site     → root domain reserved for tenant / demo sites
 *   *.gloval.site   → each generated user site (e.g. kahveduragi.gloval.site)
 *
 * The canonical host is the apex `gloval.ai`, which is the domain actually
 * configured as the project's production domain in Vercel. Values can be
 * overridden with env vars, but the defaults encode the live production setup
 * so no extra configuration is required.
 */

/** Registrable base of the main platform (used for tenant reasoning). */
export const PLATFORM_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN?.trim() || 'gloval.ai'

/**
 * Canonical, public-facing host for the platform. This is the apex domain
 * that is actually attached to the Vercel project, so all platform traffic
 * (including `www.gloval.ai`) is folded onto it, keeping authentication
 * redirects, session cookies and OAuth callbacks on a single origin.
 */
export const PLATFORM_CANONICAL_HOST =
  process.env.NEXT_PUBLIC_PLATFORM_CANONICAL_HOST?.trim() || PLATFORM_DOMAIN

/** Root domain under which every tenant/generated site is served as a subdomain. */
export const TENANT_ROOT_DOMAIN =
  process.env.NEXT_PUBLIC_TENANT_ROOT_DOMAIN?.trim() || 'gloval.site'

/**
 * Subdomains on the tenant root that are NOT tenants (reserved).
 *
 * Exported (not just used internally) so `publishProject` can refuse to mint
 * one of these as a NEW project slug — without this, a project named e.g.
 * "Admin Paneli" would slugify to `admin`, and `admin.gloval.site` would
 * silently serve that tenant's site instead of ever being available for a
 * real platform subdomain (admin tools, mail, status page, etc.). Existing
 * `www` / `preview` behavior is unchanged; this only widens the set.
 */
export const RESERVED_TENANT_SUBDOMAINS = new Set([
  'www',
  'preview',
  'admin',
  'api',
  'app',
  'auth',
  'login',
  'dashboard',
  'support',
  'help',
  'status',
  'mail',
  'webmail',
  'smtp',
  'pop',
  'imap',
  'ftp',
  'cdn',
  'static',
  'assets',
  'blog',
  'docs',
  'ns1',
  'ns2',
])

/**
 * Hosts that must 308-redirect to the canonical platform host
 * (`gloval.ai`):
 *   - www.gloval.ai   (www → apex)
 *   - gloval.site     (tenant root is not a public page)
 *   - www.gloval.site
 * `www.gloval.ai` is folded onto the apex so the whole platform lives on one
 * canonical origin. The tenant root and its www are redirected so
 * `gloval.site` never serves a customer or platform page directly — only
 * `*.gloval.site` subdomains resolve to tenant sites. The canonical apex
 * itself is intentionally NOT in this set so it is served as-is.
 */
function apexRedirectHosts(): Set<string> {
  return new Set([
    `www.${PLATFORM_DOMAIN}`,
    TENANT_ROOT_DOMAIN,
    `www.${TENANT_ROOT_DOMAIN}`,
  ])
}

/**
 * Returns the absolute platform URL to redirect to when the given Host must be
 * folded into the apex (`gloval.ai`), preserving the path + query, or null when
 * the host should be served as-is (the platform apex, tenant subdomains, or
 * local/preview hosts).
 */
export function getPlatformRedirectUrl(
  hostHeader: string | null | undefined,
  pathWithQuery: string,
): string | null {
  if (!hostHeader) return null
  const host = hostHeader.split(':')[0].toLowerCase().trim()
  if (!host) return null

  // Never redirect an actual tenant subdomain.
  if (getTenantSlugFromHost(hostHeader)) return null

  if (apexRedirectHosts().has(host)) {
    const suffix = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`
    return `https://${PLATFORM_CANONICAL_HOST}${suffix === '/' ? '' : suffix}`
  }
  return null
}

/** Full https URL of the main platform on its canonical host. */
export function platformUrl(path = '/'): string {
  return `https://${PLATFORM_CANONICAL_HOST}${path.startsWith('/') ? path : `/${path}`}`
}

/** Display host for a tenant site, e.g. `kahveduragi.gloval.site`. */
export function tenantHost(slug: string): string {
  return `${slug}.${TENANT_ROOT_DOMAIN}`
}

/** Full https URL for a tenant site. */
export function tenantUrl(slug: string): string {
  return `https://${tenantHost(slug)}`
}

/**
 * Given an incoming request Host header, return the tenant slug if the host is
 * a `<slug>.gloval.site` subdomain, or null for the platform / apex / www /
 * localhost / preview deployments. Used by middleware to rewrite tenant
 * subdomains onto the `/site/[slug]` routes.
 */
export function getTenantSlugFromHost(hostHeader: string | null | undefined): string | null {
  if (!hostHeader) return null

  // Drop any port suffix (e.g. "localhost:3000").
  const host = hostHeader.split(':')[0].toLowerCase().trim()
  if (!host) return null

  const root = TENANT_ROOT_DOMAIN.toLowerCase()

  // The apex tenant root itself is not a tenant.
  if (host === root) return null

  // Only hosts that are direct subdomains of the tenant root qualify.
  if (!host.endsWith(`.${root}`)) return null

  const sub = host.slice(0, host.length - root.length - 1)

  // Reserved and multi-level subdomains are not tenants.
  if (!sub || sub.includes('.')) return null
  if (RESERVED_TENANT_SUBDOMAINS.has(sub)) return null

  return sub
}

/**
 * True when the Host header is neither the platform's own family (apex, www,
 * the tenant root and its www/subdomains) nor a local/preview development
 * host. Used by middleware to decide whether a Host is even a CANDIDATE
 * bring-your-own custom domain worth a provider lookup — this function grants
 * no access by itself, it only avoids a pointless lookup on every ordinary
 * platform request.
 */
export function isForeignHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader) return false
  const host = hostHeader.split(':')[0].toLowerCase().trim()
  if (!host) return false

  if (host === 'localhost' || host === '127.0.0.1') return false
  if (host.endsWith('.vercel.app') || host.endsWith('.vusercontent.net')) return false
  if (host === PLATFORM_DOMAIN || host === PLATFORM_CANONICAL_HOST) return false
  if (host === `www.${PLATFORM_DOMAIN}`) return false
  if (host === TENANT_ROOT_DOMAIN || host === `www.${TENANT_ROOT_DOMAIN}`) return false
  if (host.endsWith(`.${TENANT_ROOT_DOMAIN}`)) return false

  return true
}
