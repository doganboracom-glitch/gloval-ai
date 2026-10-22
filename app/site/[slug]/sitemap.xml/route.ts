import { getPublishedSite } from '@/lib/projects'
import { closedSiteFileResponse } from '@/lib/site-availability'
import { getStoreProducts } from '@/lib/store'
import { storeSeoPlan } from '@/lib/commerce-mode'
import { getPublishedSiteRouting } from '@/lib/commerce-mode-server'
import { getSiteSeoContext } from '@/lib/seo/site-seo'
import { findPublicPage, isPageIndexable, pagePath } from '@/lib/website-pages'
import { getLiveBlogPosts } from '@/lib/blog-server'
import { resolveServices, servicePath } from '@/lib/service-pages'
import { blogPostPath, indexablePosts } from '@/lib/blog'
import { loadPublicCatalog } from '@/lib/catalog-public-server'
import { catalogCategoryPath, catalogListPath, catalogProductPath } from '@/lib/catalog-public'

/**
 * Per-tenant sitemap for a published site.
 *
 * Requests to `<slug>.gloval.site/sitemap.xml` are rewritten by the middleware
 * onto `/site/<slug>/sitemap.xml`, so every published site serves its own
 * sitemap on its own host.
 *
 * This is a plain Route Handler rather than Next's `sitemap.ts` metadata
 * convention because that convention does not receive the `[slug]` route
 * param, which is exactly what identifies the tenant here. URLs use the site's
 * canonical origin (a live custom domain when one is bound, otherwise
 * `<slug>.gloval.site`) — the internal `/site/<slug>` path must never leak into
 * a sitemap, and the sitemap must not list URLs the pages canonicalise away from.
 */

// Published content changes whenever the owner republishes.
export const dynamic = 'force-dynamic'

type UrlEntry = { loc: string; changefreq: string; priority: string; lastmod?: string | null }

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function toXml(entries: UrlEntry[]): string {
  const urls = entries
    .map((e) => {
      const lastmod = e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''
      return `  <url>\n    <loc>${escapeXml(e.loc)}</loc>${lastmod}\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const site = await getPublishedSite(slug)
  if (!site) return closedSiteFileResponse()

  const { origin: base, lastModified } = await getSiteSeoContext(slug)
  const entries: UrlEntry[] = [
    { loc: base, changefreq: 'weekly', priority: '1.0', lastmod: lastModified },
  ]

  // Every real, indexable, non-home page has its own URL and canonical.
  for (const [i, page] of (site.schema.pages ?? []).entries()) {
    const pageSlug = page.slug || `page-${i}`
    const resolved = findPublicPage(site.schema, pageSlug)
    if (!resolved || !isPageIndexable(resolved)) continue
    entries.push({
      loc: `${base}${pagePath(site.schema, pageSlug)}`,
      changefreq: 'monthly',
      priority: '0.7',
      lastmod: lastModified,
    })
    if (resolved.detailOf === 'services') {
      const services = resolveServices(site.schema)
      for (const item of services?.pageActive ? services.items : []) {
        entries.push({
          loc: `${base}${servicePath(services!.listSlug, item.slug)}`,
          changefreq: 'monthly',
          priority: '0.6',
          lastmod: lastModified,
        })
      }
    }
  }

  // Store routes only exist for sites that actually sell something. Checkout
  // and order-confirmation pages are transactional and stay out of the sitemap.
  const routing = await getPublishedSiteRouting(slug)
  const seoPlan = storeSeoPlan(routing.mode, routing.projectType)
  const products = seoPlan.indexStore ? await getStoreProducts(slug).catch(() => []) : []
  if (products.length > 0) {
    entries.push({ loc: `${base}/store`, changefreq: 'weekly', priority: '0.8', lastmod: lastModified })
    for (const product of products) {
      entries.push({
        loc: `${base}/store/${product.slug}`,
        changefreq: 'weekly',
        priority: '0.6',
        lastmod: toIso(product.created_at),
      })
    }
  }

  // Catalog sites: list, one URL per category and one per product.
  const catalog = await loadPublicCatalog(slug).catch(() => null)
  if (catalog && catalog.items.length > 0) {
    entries.push({ loc: `${base}${catalogListPath()}`, changefreq: 'weekly', priority: '0.8', lastmod: lastModified })
    for (const group of catalog.groups) {
      entries.push({ loc: `${base}${catalogCategoryPath(group.slug)}`, changefreq: 'weekly', priority: '0.7', lastmod: lastModified })
    }
    for (const item of catalog.items) {
      entries.push({
        loc: `${base}${catalogProductPath(item.categorySlug, item.slug)}`,
        changefreq: 'weekly',
        priority: '0.6',
        lastmod: lastModified,
      })
    }
  }

  // Only indexable, publicly visible posts; noindex first-setup posts stay out.
  const blogPosts = indexablePosts(await getLiveBlogPosts(slug))
  if (blogPosts.length > 0) {
    entries.push({
      loc: `${base}/blog`,
      changefreq: 'weekly',
      priority: '0.6',
      lastmod: toIso(blogPosts[0].updatedAt),
    })
    for (const post of blogPosts) {
      entries.push({
        loc: `${base}${blogPostPath(post.slug)}`,
        changefreq: 'monthly',
        priority: '0.6',
        lastmod: toIso(post.updatedAt),
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

function toIso(value: string | undefined): string | null {
  const time = value ? Date.parse(value) : NaN
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}
