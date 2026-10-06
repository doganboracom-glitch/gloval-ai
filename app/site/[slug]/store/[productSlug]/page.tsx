import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { getStoreProductBySlug } from '@/lib/store'
import { getTryOnConfigForStore } from '@/lib/try-on-settings'
import { ProductDetail } from '@/components/store/product-detail'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>
}): Promise<Metadata> {
  const { slug, productSlug } = await params
  const product = await getStoreProductBySlug(slug, productSlug)
  return { title: product ? product.name : 'Ürün' }
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

  const tryOnConfig = await getTryOnConfigForStore(slug)

  return (
    <ProductDetail
      slug={slug}
      storeName={site.name}
      product={product}
      enableTryOn={tryOnConfig !== null}
    />
  )
}
