import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadPublicCatalog } from '@/lib/catalog-public-server'
import { buildBreadcrumbJsonLd, catalogListPath, jsonLdScripts } from '@/lib/catalog-public'
import { CatalogPageShell } from '@/components/catalog/catalog-page-shell'
import { CatalogListView } from '@/components/catalog/catalog-list-view'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const catalog = await loadPublicCatalog(slug)
  if (!catalog) notFound()
  const title = `Ürünlerimiz | ${catalog.site.name}`
  const description = `${catalog.site.name} ürün kataloğu: ${catalog.groups.map((g) => g.name).slice(0, 4).join(', ')}.`
  const canonical = `${catalog.origin}${catalogListPath()}`
  return { title, description, alternates: { canonical }, openGraph: { title, description, url: canonical, type: 'website' } }
}

export default async function CatalogListPage({ params }: Params) {
  const { slug } = await params
  const catalog = await loadPublicCatalog(slug)
  if (!catalog) notFound()
  const [breadcrumb] = jsonLdScripts(
    buildBreadcrumbJsonLd([
      { name: 'Ana sayfa', url: `${catalog.origin}/` },
      { name: 'Ürünlerimiz', url: `${catalog.origin}${catalogListPath()}` },
    ]),
  )
  return (
    <CatalogPageShell catalog={catalog}>
      <CatalogListView storeName={catalog.site.name} groups={catalog.groups} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumb }} />
    </CatalogPageShell>
  )
}
