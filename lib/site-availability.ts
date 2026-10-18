/**
 * Copy for a tenant request that finds no published site (never published,
 * unpublished, suspended or deleted). Only Turkish and English are written;
 * every other visitor language gets English.
 */
export function siteUnavailableCopy(lang: string): { title: string; body: string } {
  return lang === 'tr'
    ? {
        title: 'Bu site şu an yayında değil',
        body: 'Site sahibi siteyi yayından kaldırmış, askıya alınmış ya da silinmiş olabilir. Lütfen daha sonra tekrar deneyin.',
      }
    : {
        title: 'This site is not available right now',
        body: 'The site owner may have unpublished it, it may be suspended, or it may have been deleted. Please try again later.',
      }
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
