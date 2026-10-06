import { getPublishedSite } from '@/lib/projects'
import { getStoreProducts } from '@/lib/store'
import { tenantUrl } from '@/lib/domains'

/**
 * Per-tenant sitemap for a published site.
 *
 * Requests to `<slug>.gloval.site/sitemap.xml` are rewritten by the middleware
 * onto `/site/<slug>/sitemap.xml`, so every published site serves its own
 * sitemap on its own canonical host.
 *
 * This is a plain Route Handler rather than Next's `sitemap.ts` metadata
 * convention because that convention does not receive the `[slug]` route
 * param, which is exactly what identifies the tenant here. URLs are always
 * built with `tenantUrl()` — the internal `/site/<slug>` path must never leak
 * into a sitemap.
 */

// Published content changes whenever the owner republishes.
export const dynamic = 'force-dynamic'

type UrlEntry = { loc: string; changefreq: string; priority: string }

function toXml(entries: UrlEntry[]): string {
  const urls = entries
    .map(
      (e) =>
        `  <url>\n    <loc>${e.loc}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const site = await getPublishedSite(slug)
  if (!site) {
    return new Response('Not found', { status: 404 })
  }

  const base = tenantUrl(slug)
  const entries: UrlEntry[] = [
    { loc: base, changefreq: 'weekly', priority: '1.0' },
  ]

  // Store routes only exist for sites that actually sell something. Checkout
  // and order-confirmation pages are transactional and stay out of the sitemap.
  const products = await getStoreProducts(slug).catch(() => [])
  if (products.length > 0) {
    entries.push({ loc: `${base}/store`, changefreq: 'weekly', priority: '0.8' })
    for (const product of products) {
      entries.push({
        loc: `${base}/store/${product.slug}`,
        changefreq: 'weekly',
        priority: '0.6',
      })
    }
  }

  return new Response(toXml(entries), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
