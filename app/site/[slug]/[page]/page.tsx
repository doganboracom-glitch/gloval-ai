import type { Metadata } from 'next'
import { PublicSiteView, buildSitePageMetadata } from '@/components/site/public-site-view'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string; page: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, page } = await params
  return buildSitePageMetadata(slug, page)
}

export default async function PublicSitePageRoute({ params }: { params: Params }) {
  const { slug, page } = await params
  return <PublicSiteView slug={slug} pageSlug={page} />
}
