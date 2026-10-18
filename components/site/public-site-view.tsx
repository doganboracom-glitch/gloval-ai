import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { SiteUnpublished } from '@/components/site/site-unpublished'
import { getStoreCollections, getStoreProducts } from '@/lib/store'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import type { StoreCatalog } from '@/components/website-renderer/store-catalog-context'
import { getStoreShippingInfo } from '@/lib/store-shipping-settings'
import { getSiteBlogData } from '@/lib/blog-server'
import { isSiteBrandingRemoved } from '@/lib/project-entitlements'
import { getSiteSeoContext } from '@/lib/seo/site-seo'
import { isStorefront } from '@/lib/website-schema'
import { getStorePaymentBadges } from '@/lib/store-payment-badges'
import { contactSecret, signContactToken } from '@/lib/site-contact-guard'
import { findPublicPage, isPageIndexable, pagePath } from '@/lib/website-pages'

/**
 * Metadata for the home page (`pageSlug` null) or one real page. Titles,
 * descriptions, canonical and og:url are per page; a page the owner marked
 * non-indexable is `noindex`.
 */
export async function buildSitePageMetadata(slug: string, pageSlug: string | null): Promise<Metadata> {
  const site = await getPublishedSite(slug)
  if (!site) return { title: 'Site bulunamadı' }
  const page = pageSlug ? findPublicPage(site.schema, pageSlug) : null
  if (pageSlug && !page) return { title: 'Sayfa bulunamadı', robots: { index: false, follow: false } }

  const description = page?.seo?.description?.trim() || site.schema.meta.description || site.schema.meta.tagline
  const seoTitle = site.schema.meta.seoTitle?.trim()
  const siteTitle = seoTitle ? `${site.name} - ${seoTitle}` : site.name
  const title = page ? page.seo?.title?.trim() || `${page.title} | ${site.name}` : siteTitle

  // Tenant pages are canonical to their OWN public origin (a live custom
  // domain when bound, else the subdomain), never to gloval.ai.
  const { origin } = await getSiteSeoContext(slug)
  const canonical = page ? `${origin}${pagePath(site.schema, page.slug)}` : origin
  const indexable = page ? isPageIndexable(page) : true
  return {
    title,
    description,
    metadataBase: new URL(origin),
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    robots: { index: indexable, follow: true },
  }
}

export async function PublicSiteView({ slug, pageSlug }: { slug: string; pageSlug: string | null }) {
  const [site, brandingRemoved, products, collections, shipping, blog] = await Promise.all([
    getPublishedSite(slug),
    isSiteBrandingRemoved(slug),
    // Real catalog for this store. Empty for corporate sites: then the site
    // renders exactly as before (no cart, display-only sections).
    getStoreProducts(slug),
    getStoreCollections(slug),
    getStoreShippingInfo(slug),
    getSiteBlogData(slug),
  ])
  if (!site) return <SiteUnpublished />

  let page: ReturnType<typeof findPublicPage> = null
  if (pageSlug) {
    page = findPublicPage(site.schema, pageSlug)
    if (!page) {
      // A renamed page keeps answering on its old URL with a permanent redirect.
      const moved = site.schema.pageRedirects?.find((r) => r.from === `/${pageSlug.toLowerCase()}`)
      if (moved && findPublicPage(site.schema, moved.to.replace(/^\//, ''))) permanentRedirect(moved.to)
      notFound()
    }
  }

  const paymentBadges = isStorefront(site.schema) ? await getStorePaymentBadges(slug) : null

  const store: StoreCatalog | null =
    products.length > 0
      ? {
          slug,
          products,
          collections: collections.map((c) => ({
            slug: c.slug,
            name: c.name,
            product_ids: c.product_ids,
          })),
          shipping,
          bySlug: Object.fromEntries(
            products.map((p) => [
              p.slug,
              {
                id: p.id,
                slug: p.slug,
                priceCents: p.price_cents,
                currency: p.currency,
                stock: p.stock,
                image: p.images[0]?.url ?? null,
              },
            ]),
          ),
        }
      : null

  // Without the server secret the form stays inert instead of accepting unsigned posts.
  const secret = contactSecret()
  const contactForm = secret ? { slug, token: signContactToken(secret, slug, Date.now()) } : null

  return (
    <main className="min-h-svh bg-white text-black">
      {/* The "Gloval AI ile oluşturuldu." credit is on unless this specific
          site's owner bought the one-time Copyright Kaldırma right. */}
      <WebsiteRenderer
        site={site.schema}
        showBranding={!brandingRemoved}
        planCode={site.ownerPlanCode}
        store={store}
        paymentBadges={paymentBadges}
        contactForm={contactForm}
        initialPage={page?.slug ?? null}
        blog={blog}
        pageRouting
      />
    </main>
  )
}
