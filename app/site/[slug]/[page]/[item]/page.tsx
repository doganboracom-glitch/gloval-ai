import type { Metadata } from 'next'
import { PublicSiteView, buildSitePageMetadata } from '@/components/site/public-site-view'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string; page: string; item: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, page, item } = await params
  return buildSitePageMetadata(slug, page, item)
}

export default async function PublicSiteItemRoute({ params }: { params: Params }) {
  const { slug, page, item } = await params
  return <PublicSiteView slug={slug} pageSlug={page} itemSlug={item} />
}
