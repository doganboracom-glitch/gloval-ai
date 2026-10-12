import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { getStoreProductBySlug, getStoreProducts } from '@/lib/store'
import { getTryOnConfigForStore } from '@/lib/try-on-settings'
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
  const product = await getStoreProductBySlug(slug, productSlug)
  if (!product) return { title: 'Ürün' }
  const description = product.seo_description ?? product.description ?? undefined
  return {
    title: product.seo_title ?? product.name,
    ...(description ? { description } : {}),
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

  const [tryOnConfig, shipping, products] = await Promise.all([
    getTryOnConfigForStore(slug),
    getStoreShippingInfo(slug),
    getStoreProducts(slug),
  ])
  const images = product.images.map((image) => image.url)
  const availability = product.track_stock === false ? 'https://schema.org/InStock' : product.stock <= 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock'

  return (
    <StoreSiteShell site={site.schema}>
      <ProductDetail
        slug={slug}
        shipping={shipping}
        storeName={site.name}
        product={product}
        relatedProducts={products.filter((item) => item.id !== product.id && item.category_id === product.category_id).slice(0, 4)}
        whatsapp={site.schema.contactActions?.whatsapp ? { href: `https://wa.me/${site.schema.contactActions.whatsapp.replace(/\D/g, '')}`, display: site.schema.contactActions.whatsapp } : null}
        enableTryOn={tryOnConfig !== null}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'Product', name: product.name,
        image: images, description: product.description ?? undefined, sku: product.id,
        offers: { '@type': 'Offer', price: (product.price_cents / 100).toFixed(2), priceCurrency: product.currency, availability },
      }) }} />
    </StoreSiteShell>
  )
}
