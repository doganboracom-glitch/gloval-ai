import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { loadCatalogPaths } from '@/lib/catalog-public-server'
import { getPublishedSite } from '@/lib/projects'
import { getStoreProductBySlug, getStoreProducts, getStorePaymentMethods } from '@/lib/store'
import { getTryOnConfigForStore } from '@/lib/try-on-settings'
import { isCardProviderMethod } from '@/lib/payments/methods'
import { getSiteSeoContext } from '@/lib/seo/site-seo'
import { buildTenantSocialMetadata } from '@/lib/seo/site-sharing'
import { productJsonLdScript } from '@/lib/product-json-ld'
import { ProductDetail } from '@/components/store/product-detail'
import { StoreSiteShell } from '@/components/store/store-site-shell'
import { getSiteBlogData } from '@/lib/blog-server'
import { getStoreShippingInfo } from '@/lib/store-shipping-settings'
import { getCatalogContext, getPublishedSiteRouting } from '@/lib/commerce-mode-server'
import { modeHasStoreRoutes } from '@/lib/commerce-mode'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>
}): Promise<Metadata> {
  const { slug, productSlug } = await params
  const site = await getPublishedSite(slug)
  if (!site) notFound()
  const product = await getStoreProductBySlug(slug, productSlug)
  if (!product) notFound()
  const description = product.seo_description ?? product.description ?? undefined
  const seo = await getSiteSeoContext(slug)
  const canonical = `${seo.origin}/store/${productSlug}`
  return buildTenantSocialMetadata({
    site,
    slug,
    origin: seo.origin,
    lastModified: seo.lastModified,
    canonical,
    title: product.seo_title ?? product.name,
    description,
  })
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>
}) {
  const { slug, productSlug } = await params
  const site = await getPublishedSite(slug)
  if (!site) notFound()

  const { id: projectId, mode, catalogPaths } = await getPublishedSiteRouting(slug)
  if (!modeHasStoreRoutes(mode)) notFound()

  const product = await getStoreProductBySlug(slug, productSlug)
  if (!product) notFound()

  if (catalogPaths && projectId) {
    const paths = await loadCatalogPaths(projectId, [product])
    const target = paths.products[product.slug]
    if (target) permanentRedirect(`${(await getSiteSeoContext(slug)).origin}${target}`)
  }

  const catalog = await getCatalogContext(slug, site.schema, mode)
  const canonicalPath =
    mode === 'catalog' && projectId
      ? (await loadCatalogPaths(projectId, [product])).products[product.slug]
      : undefined

  const [seo, tryOnConfig, shipping, products, payments] = await Promise.all([
    getSiteSeoContext(slug),
    getTryOnConfigForStore(slug),
    getStoreShippingInfo(slug),
    getStoreProducts(slug),
    getStorePaymentMethods(slug),
  ])

  return (
    <StoreSiteShell site={site.schema} slug={slug} shipping={shipping} mode={mode} whatsappNumber={catalog.whatsappNumber} origin={catalog.origin} blog={await getSiteBlogData(slug)}>
      <ProductDetail
        slug={slug}
        shipping={shipping}
        storeName={site.name}
        product={product}
        relatedProducts={products.filter((item) => item.id !== product.id && item.category_id === product.category_id).slice(0, 4)}
        whatsapp={site.schema.contactActions?.whatsapp && /\d/.test(site.schema.contactActions.whatsapp) ? { href: `https://wa.me/${site.schema.contactActions.whatsapp.replace(/\D/g, '')}`, display: site.schema.contactActions.whatsapp } : null}
        canonicalPath={canonicalPath}
        enableTryOn={tryOnConfig !== null}
        cardPaymentEnabled={payments.available && payments.methods.some(isCardProviderMethod)}
        codEnabled={payments.available && payments.methods.includes('cash_on_delivery')}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productJsonLdScript(product, `${seo.origin}/store/${productSlug}`) }} />
    </StoreSiteShell>
  )
}
