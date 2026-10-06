import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { getStoreProducts } from '@/lib/store'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import type { StoreCatalog } from '@/components/website-renderer/store-catalog-context'
import { isSiteBrandingRemoved } from '@/lib/project-entitlements'
import { tenantUrl } from '@/lib/domains'

// Published sites are dynamic (content can change on republish/unpublish).
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const site = await getPublishedSite(slug)
  if (!site) return { title: 'Site bulunamadı' }
  const description = site.schema.meta.description || site.schema.meta.tagline
  // The owner-authored SEO title is appended to the site name:
  // "Nakliyat" + "İstanbul Nakliyeci" -> "Nakliyat - İstanbul Nakliyeci".
  // When it is empty (or was never set) the plain site name is used, exactly
  // like before.
  const seoTitle = site.schema.meta.seoTitle?.trim()
  const title = seoTitle ? `${site.name} - ${seoTitle}` : site.name
  // Tenant pages are canonical to their OWN subdomain, never to gloval.ai.
  const canonical = tenantUrl(slug)
  return {
    title,
    description,
    // Override the platform metadataBase so relative URLs resolve to the tenant.
    metadataBase: new URL(canonical),
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    robots: { index: true, follow: true },
  }
}

export default async function PublicSitePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [site, brandingRemoved, products] = await Promise.all([
    getPublishedSite(slug),
    isSiteBrandingRemoved(slug),
    // Real catalog for this store. Empty for corporate sites — then the site
    // renders exactly as before (no cart, display-only sections).
    getStoreProducts(slug),
  ])
  if (!site) notFound()

  // Only wire the storefront (cart + clickable product cards) when the site
  // actually has synced products. Keyed by product slug so the schema cards can
  // resolve their live product by name.
  const store: StoreCatalog | null =
    products.length > 0
      ? {
          slug,
          bySlug: Object.fromEntries(
            products.map((p) => [
              p.slug,
              {
                id: p.id,
                slug: p.slug,
                priceCents: p.price_cents,
                currency: p.currency,
                stock: p.stock,
                image: p.images[0] ?? null,
              },
            ]),
          ),
        }
      : null

  return (
    <main className="min-h-svh bg-white text-black">
      {/* The "Gloval AI ile oluşturuldu." credit is on unless this specific
          site's owner bought the one-time Copyright Kaldırma right. */}
      <WebsiteRenderer
        site={site.schema}
        showBranding={!brandingRemoved}
        planCode={site.ownerPlanCode}
        store={store}
      />
    </main>
  )
}
