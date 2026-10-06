import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { getStoreProducts } from '@/lib/store'
import { StoreFront } from '@/components/store/store-front'

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
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const site = await getPublishedSite(slug)
  if (!site) notFound()

  const products = await getStoreProducts(slug)

  return <StoreFront slug={slug} storeName={site.name} products={products} />
}
