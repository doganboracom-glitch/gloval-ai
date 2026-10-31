import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { loadPublicCatalog } from '@/lib/catalog-public-server'
import { buildTenantSocialMetadata } from '@/lib/seo/site-sharing'
import { findCategoryGroup } from '@/lib/product-categories'
import { buildBreadcrumbJsonLd, catalogCategoryPath, catalogListPath, jsonLdScripts } from '@/lib/catalog-public'
import { catalogLabels, catalogPageHref, findCatalogBandImage, paginate, parsePage } from '@/lib/catalog-view'
import { CatalogPageShell } from '@/components/catalog/catalog-page-shell'
import { CatalogListView } from '@/components/catalog/catalog-list-view'

export const dynamic = 'force-dynamic'

type Params = {
  params: Promise<{ slug: string; category: string }>
  searchParams: Promise<{ sayfa?: string | string[] }>
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug, category } = await params
  const { sayfa } = await searchParams
  const catalog = await loadPublicCatalog(slug)
  const found = catalog ? findCategoryGroup(catalog.groups, catalog.categoryRedirects, category) : null
  if (!catalog || !found) notFound()
  const group = found.group
  const page = paginate(group.items, parsePage(sayfa)).page
  const title = `${group.name} | ${catalog.site.name}`
  const description = `${catalog.site.name} ${group.name}: ${group.items.map((i) => i.name).slice(0, 4).join(', ')}.`
  const canonical = `${catalog.origin}${catalogPageHref(catalogCategoryPath(group.slug), page)}`
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

export default async function CatalogCategoryPage({ params, searchParams }: Params) {
  const { slug, category } = await params
  const { sayfa } = await searchParams
  const catalog = await loadPublicCatalog(slug)
  const found = catalog ? findCategoryGroup(catalog.groups, catalog.categoryRedirects, category) : null
  if (!catalog || !found) notFound()
  const group = found.group
  if (found.moved) {
    const query = parsePage(sayfa)
    permanentRedirect(catalogPageHref(catalogCategoryPath(group.slug), query))
  }
  const labels = catalogLabels(catalog.site.schema.meta.language)
  const [breadcrumb] = jsonLdScripts(
    buildBreadcrumbJsonLd([
      { name: labels.home, url: `${catalog.origin}/` },
      { name: labels.title, url: `${catalog.origin}${catalogListPath()}` },
      { name: group.name, url: `${catalog.origin}${catalogCategoryPath(group.slug)}` },
    ]),
  )
  return (
    <CatalogPageShell catalog={catalog}>
      <CatalogListView
        storeName={catalog.site.name}
        groups={catalog.groups}
        activeSlug={group.slug}
        labels={labels}
        page={parsePage(sayfa)}
        heroImage={findCatalogBandImage(catalog.site.schema)}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumb }} />
    </CatalogPageShell>
  )
}
