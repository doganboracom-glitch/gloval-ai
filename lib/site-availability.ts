/**
 * Copy for a tenant request that finds no published site (never published,
 * unpublished, suspended or deleted). Only Turkish and English are written;
 * every other visitor language gets English.
 */
export type SiteUnavailableCopy = {
  title: string
  body: string
  /** Owner note, split around the "support ticket" link text. */
  ownerNote: { before: string; link: string; after: string }
  homeButton: string
  ticketSubject: string
}

export function siteUnavailableCopy(lang: string): SiteUnavailableCopy {
  return lang === 'tr'
    ? {
        title: 'Bu site şu an yayında değil',
        body: 'Aradığınız site kapatılmış, askıya alınmış ya da henüz yayına alınmamış olabilir.',
        ownerNote: {
          before: 'Bu site size aitse GLOVAL AI paneline giriş yaparak sitenizi yayına alabilir veya ',
          link: 'destek talebi',
          after: ' oluşturabilirsiniz.',
        },
        homeButton: "GLOVAL AI'a git",
        ticketSubject: 'Sitem yayında görünmüyor',
      }
    : {
        title: 'This site is not available right now',
        body: 'The site you are looking for may have been taken down, suspended, or not published yet.',
        ownerNote: {
          before: 'If this site is yours, you can sign in to your GLOVAL AI dashboard to publish it, or create a ',
          link: 'support ticket',
          after: '.',
        },
        homeButton: 'Go to GLOVAL AI',
        ticketSubject: 'My site is not showing as published',
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
