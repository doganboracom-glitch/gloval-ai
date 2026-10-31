import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { loadPublicCatalog } from '@/lib/catalog-public-server'
import { buildTenantSocialMetadata } from '@/lib/seo/site-sharing'
import {
  buildBreadcrumbJsonLd,
  buildCatalogProductJsonLd,
  buildCatalogWhatsappUrl,
  catalogCategoryPath,
  catalogListPath,
  catalogProductPath,
  jsonLdScripts,
} from '@/lib/catalog-public'
import { catalogLabels, findCatalogPageImage } from '@/lib/catalog-view'
import { findCatalogItem } from '@/lib/product-items'
import { CatalogPageShell } from '@/components/catalog/catalog-page-shell'
import { CatalogProductView } from '@/components/catalog/catalog-product-view'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ slug: string; category: string; product: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, product: productSlug } = await params
  const catalog = await loadPublicCatalog(slug)
  const found = catalog ? findCatalogItem(catalog.items, productSlug) : null
  if (!catalog || !found) notFound()
  const item = found.item
  const title = item.seoTitle ?? `${item.name} | ${catalog.site.name}`
  const description = item.seoDescription ?? item.description?.slice(0, 160) ?? undefined
  const canonical = `${catalog.origin}${catalogProductPath(item.categorySlug, item.slug)}`
  return buildTenantSocialMetadata({
    site: catalog.site,
    slug,
    origin: catalog.origin,
    lastModified: catalog.lastModified,
    canonical,
    title,
    description,
  })
}

export default async function CatalogProductPage({ params }: Params) {
  const { slug, category, product: productSlug } = await params
  const catalog = await loadPublicCatalog(slug)
  const found = catalog ? findCatalogItem(catalog.items, productSlug) : null
  if (!catalog || !found) notFound()
  const item = found.item

  // A product keeps one canonical address: an old name, or a stale or wrong category segment, redirects there.
  if (found.moved || item.categorySlug !== category) permanentRedirect(catalogProductPath(item.categorySlug, item.slug))

  const productUrl = `${catalog.origin}${catalogProductPath(item.categorySlug, item.slug)}`
  const whatsappHref = catalog.whatsappNumber
    ? buildCatalogWhatsappUrl({ number: catalog.whatsappNumber, productName: item.name, sku: item.sku, productUrl })
    : null
  const related = catalog.items.filter((i) => i.id !== item.id && i.categorySlug === item.categorySlug).slice(0, 4)

  const [productLd, breadcrumbLd] = jsonLdScripts(
    buildCatalogProductJsonLd(item, productUrl),
    buildBreadcrumbJsonLd([
      { name: 'Ana sayfa', url: `${catalog.origin}/` },
      { name: 'Ürünlerimiz', url: `${catalog.origin}${catalogListPath()}` },
      { name: item.categoryName, url: `${catalog.origin}${catalogCategoryPath(item.categorySlug)}` },
      { name: item.name, url: productUrl },
    ]),
  )

  return (
    <CatalogPageShell catalog={catalog}>
      <CatalogProductView bandImage={findCatalogPageImage(catalog.site.schema)} storeName={catalog.site.name} item={item} related={related} whatsappHref={whatsappHref} phone={catalog.phone} labels={catalogLabels(catalog.site.schema.meta.language)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productLd }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbLd }} />
    </CatalogPageShell>
  )
}
