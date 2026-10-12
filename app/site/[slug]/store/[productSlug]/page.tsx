import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { getStoreProductBySlug } from '@/lib/store'
import { getTryOnConfigForStore } from '@/lib/try-on-settings'
import { ProductDetail } from '@/components/store/product-detail'
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

  const [tryOnConfig, shipping] = await Promise.all([
    getTryOnConfigForStore(slug),
    getStoreShippingInfo(slug),
  ])

  return (
    <ProductDetail
      slug={slug}
      shipping={shipping}
      storeName={site.name}
      product={product}
      enableTryOn={tryOnConfig !== null}
    />
  )
}
