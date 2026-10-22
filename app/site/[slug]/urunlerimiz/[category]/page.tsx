import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadPublicCatalog } from '@/lib/catalog-public-server'
import { buildBreadcrumbJsonLd, catalogCategoryPath, catalogListPath, jsonLdScripts } from '@/lib/catalog-public'
import { CatalogPageShell } from '@/components/catalog/catalog-page-shell'
import { CatalogListView } from '@/components/catalog/catalog-list-view'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ slug: string; category: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, category } = await params
  const catalog = await loadPublicCatalog(slug)
  const group = catalog?.groups.find((g) => g.slug === category)
  if (!catalog || !group) notFound()
  const title = `${group.name} | ${catalog.site.name}`
  const description = `${catalog.site.name} ${group.name} ürünleri: ${group.items.map((i) => i.name).slice(0, 4).join(', ')}.`
  const canonical = `${catalog.origin}${catalogCategoryPath(group.slug)}`
  return { title, description, alternates: { canonical }, openGraph: { title, description, url: canonical, type: 'website' } }
}

export default async function CatalogCategoryPage({ params }: Params) {
  const { slug, category } = await params
  const catalog = await loadPublicCatalog(slug)
  const group = catalog?.groups.find((g) => g.slug === category)
  if (!catalog || !group) notFound()
  const [breadcrumb] = jsonLdScripts(
    buildBreadcrumbJsonLd([
      { name: 'Ana sayfa', url: `${catalog.origin}/` },
      { name: 'Ürünlerimiz', url: `${catalog.origin}${catalogListPath()}` },
      { name: group.name, url: `${catalog.origin}${catalogCategoryPath(group.slug)}` },
    ]),
  )
  return (
    <CatalogPageShell catalog={catalog}>
      <CatalogListView storeName={catalog.site.name} groups={catalog.groups} activeSlug={group.slug} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumb }} />
    </CatalogPageShell>
  )
}
