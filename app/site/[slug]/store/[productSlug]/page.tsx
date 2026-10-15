import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { getStoreProductBySlug, getStoreProducts, getStorePaymentMethods } from '@/lib/store'
import { getTryOnConfigForStore } from '@/lib/try-on-settings'
import { isCardProviderMethod } from '@/lib/payments/methods'
import { getSiteSeoContext } from '@/lib/seo/site-seo'
import { productJsonLdScript } from '@/lib/product-json-ld'
import { ProductDetail } from '@/components/store/product-detail'
import { StoreSiteShell } from '@/components/store/store-site-shell'
import { getStoreShippingInfo } from '@/lib/store-shipping-settings'

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
  const image = product.images[0]?.url
  const { origin } = await getSiteSeoContext(slug)
  const canonical = `${origin}/store/${productSlug}`
  return {
    title: product.seo_title ?? product.name,
    ...(description ? { description } : {}),
    alternates: { canonical },
    openGraph: {
      title: product.seo_title ?? product.name,
      ...(description ? { description } : {}),
      url: canonical,
      type: 'website' as const,
      ...(image ? { images: [{ url: image, alt: product.name }] } : {}),
    },
  }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>
}) {
  const { slug, productSlug } = await params
  const site = await getPublishedSite(slug)
  if (!site) notFound()

  const product = await getStoreProductBySlug(slug, productSlug)
  if (!product) notFound()

  const [seo, tryOnConfig, shipping, products, payments] = await Promise.all([
    getSiteSeoContext(slug),
    getTryOnConfigForStore(slug),
    getStoreShippingInfo(slug),
    getStoreProducts(slug),
    getStorePaymentMethods(slug),
  ])

  return (
    <StoreSiteShell site={site.schema} slug={slug} shipping={shipping}>
      <ProductDetail
        slug={slug}
        shipping={shipping}
        storeName={site.name}
        product={product}
        relatedProducts={products.filter((item) => item.id !== product.id && item.category_id === product.category_id).slice(0, 4)}
        whatsapp={site.schema.contactActions?.whatsapp && /\d/.test(site.schema.contactActions.whatsapp) ? { href: `https://wa.me/${site.schema.contactActions.whatsapp.replace(/\D/g, '')}`, display: site.schema.contactActions.whatsapp } : null}
        enableTryOn={tryOnConfig !== null}
        cardPaymentEnabled={payments.available && payments.methods.some(isCardProviderMethod)}
        codEnabled={payments.available && payments.methods.includes('cash_on_delivery')}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productJsonLdScript(product, `${seo.origin}/store/${productSlug}`) }} />
    </StoreSiteShell>
  )
}
