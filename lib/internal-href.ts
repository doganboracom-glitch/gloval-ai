/**
 * Render-time repair of hand-written relative links.
 *
 * An AI edit or an owner can store a menu/footer/CTA target such as `blog` or
 * `hakkimizda`. A relative URL resolves against the CURRENT path, so it works
 * on the home page and dead-ends on `/blog/some-post`. Instead of rewriting
 * stored data, the renderer turns such targets into absolute paths while
 * drawing the link. Only targets we recognise are touched: the site's own page
 * slugs and the system routes every published site serves.
 */

/** First path segments every published site serves (tenant-relative). */
export const SYSTEM_ROUTE_ROOTS = ['blog', 'store', 'hesap', 'yasal', 'checkout', 'order'] as const

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i

function firstSegment(path: string): string {
  return path.split(/[/?#]/)[0] ?? ''
}

/**
 * `blog` -> `/blog`, `./store?x=1` -> `/store?x=1`, `hakkimizda` -> `/hakkimizda`
 * (when `hakkimizda` is a page slug). Everything else is returned unchanged:
 * absolute paths, anchors, URLs with a scheme or `://`, mailto:/tel:, empty
 * values and relative targets that match no known route.
 */
export function normalizeInternalHref(href: string, pageSlugs: readonly string[] = []): string {
  const raw = (href ?? '').trim()
  if (!raw || raw.startsWith('/') || raw.startsWith('#')) return href
  if (raw.includes('://') || SCHEME_RE.test(raw)) return href

  const path = raw.replace(/^(?:\.\/)+/, '')
  const first = firstSegment(path).toLowerCase()
  if (!first) return href

  const known =
    (SYSTEM_ROUTE_ROOTS as readonly string[]).includes(first) ||
    pageSlugs.some((slug) => slug.toLowerCase() === first)
  return known ? `/${path}` : href
}
