import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { modeHasStoreRoutes } from '@/lib/commerce-mode'
import { getCatalogContext, getPublishedSiteRouting } from '@/lib/commerce-mode-server'
import { catalogListPath } from '@/lib/catalog-public'
import { getSiteSeoContext } from '@/lib/seo/site-seo'
import { getStoreCollections, getStoreProducts } from '@/lib/store'
import { StoreFront } from '@/components/store/store-front'
import { StoreSiteShell } from '@/components/store/store-site-shell'
import { getSiteBlogData } from '@/lib/blog-server'
import { getStoreShippingInfo } from '@/lib/store-shipping-settings'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const site = await getPublishedSite(slug)
  return { title: site ? `${site.name} — Mağaza` : 'Mağaza' }
}

export default async function StorePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ slug }, initialParams] = await Promise.all([params, searchParams])
  const site = await getPublishedSite(slug)
  if (!site) notFound()
  const { mode, catalogPaths } = await getPublishedSiteRouting(slug)
  if (!modeHasStoreRoutes(mode)) notFound()
  if (catalogPaths) permanentRedirect(`${(await getSiteSeoContext(slug)).origin}${catalogListPath()}`)

  const catalog = await getCatalogContext(slug, site.schema, mode)
  const [products, collections, shipping] = await Promise.all([
    getStoreProducts(slug),
    getStoreCollections(slug),
    getStoreShippingInfo(slug),
  ])

  return (
    <StoreSiteShell site={site.schema} slug={slug} shipping={shipping} mode={mode} whatsappNumber={catalog.whatsappNumber} origin={catalog.origin} blog={await getSiteBlogData(slug)}>
      <StoreFront
        slug={slug}
        storeName={site.name}
        products={products}
        collections={collections}
        shipping={shipping}
        initialParams={initialParams}
      />
    </StoreSiteShell>
  )
}
