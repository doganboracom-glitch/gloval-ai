import type { Metadata } from 'next'
import { PublicSiteView, buildSitePageMetadata } from '@/components/site/public-site-view'

// Published sites are dynamic (content can change on republish/unpublish).
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  return buildSitePageMetadata(slug, null)
}

export default async function PublicSitePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <PublicSiteView slug={slug} pageSlug={null} />
}
