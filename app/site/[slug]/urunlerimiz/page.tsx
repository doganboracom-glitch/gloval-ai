import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadPublicCatalog } from '@/lib/catalog-public-server'
import { buildBreadcrumbJsonLd, catalogListPath, jsonLdScripts } from '@/lib/catalog-public'
import { catalogLabels, catalogPageHref, findCatalogBandImage, parsePage, paginate } from '@/lib/catalog-view'
import { CatalogPageShell } from '@/components/catalog/catalog-page-shell'
import { CatalogListView } from '@/components/catalog/catalog-list-view'

export const dynamic = 'force-dynamic'

type Params = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ sayfa?: string | string[] }>
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug } = await params
  const { sayfa } = await searchParams
  const catalog = await loadPublicCatalog(slug)
  if (!catalog) notFound()
  const labels = catalogLabels(catalog.site.schema.meta.language)
  const total = catalog.groups.reduce((n, g) => n + g.items.length, 0)
  const page = paginate(new Array(total), parsePage(sayfa)).page
  const title = `${labels.title} | ${catalog.site.name}`
  const description = `${catalog.site.name}: ${catalog.groups.map((g) => g.name).slice(0, 4).join(', ')}.`
  const canonical = `${catalog.origin}${catalogPageHref(catalogListPath(), page)}`
  return { title, description, alternates: { canonical }, openGraph: { title, description, url: canonical, type: 'website' } }
}

export default async function CatalogListPage({ params, searchParams }: Params) {
  const { slug } = await params
  const { sayfa } = await searchParams
  const catalog = await loadPublicCatalog(slug)
  if (!catalog) notFound()
  const labels = catalogLabels(catalog.site.schema.meta.language)
  const [breadcrumb] = jsonLdScripts(
    buildBreadcrumbJsonLd([
      { name: labels.home, url: `${catalog.origin}/` },
      { name: labels.title, url: `${catalog.origin}${catalogListPath()}` },
    ]),
  )
  return (
    <CatalogPageShell catalog={catalog}>
      <CatalogListView
        storeName={catalog.site.name}
        groups={catalog.groups}
        labels={labels}
        page={parsePage(sayfa)}
        heroImage={findCatalogBandImage(catalog.site.schema)}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumb }} />
    </CatalogPageShell>
  )
}
