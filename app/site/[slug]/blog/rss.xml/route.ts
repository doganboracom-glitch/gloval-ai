import { getPublishedSite } from '@/lib/projects'
import { closedSiteFileResponse } from '@/lib/site-availability'
import { getSiteSeoContext } from '@/lib/seo/site-seo'
import { getLiveBlogPosts } from '@/lib/blog-server'
import { buildRss, indexablePosts } from '@/lib/blog'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const site = await getPublishedSite(slug)
  if (!site) return closedSiteFileResponse()

  const posts = await getLiveBlogPosts(slug)
  if (indexablePosts(posts).length === 0) return new Response('Not found', { status: 404 })

  const { origin } = await getSiteSeoContext(slug)
  const xml = buildRss({ siteName: site.name, origin, lang: site.schema.meta.language, posts })
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600',
    },
  })
}
