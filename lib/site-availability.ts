/**
 * What a visitor sees when a tenant request finds no published site:
 * the slug belongs to a project the owner has not (or no longer) published,
 * or there is no such site at all.
 */
export type MissingSiteKind = 'unpublished' | 'missing'

export function classifyMissingSite(row: { published: boolean | null } | null | undefined): MissingSiteKind {
  return row ? 'unpublished' : 'missing'
}

/**
 * "Back to the site's home" target for the tenant 404 page. On a tenant host or
 * custom domain the site lives at the root; on the platform host it lives under
 * `/site/<slug>`, so a bare `/` would leave the site for the GLOVAL homepage.
 */
export function siteHomeHref(pathname: string | null | undefined): string {
  const match = (pathname ?? '').match(/^\/site\/([^/]+)/)
  return match ? `/site/${match[1]}` : '/'
}
