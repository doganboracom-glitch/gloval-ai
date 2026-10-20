import { getPosts } from '@/lib/content/blog'
import { buildBlogRss } from '@/lib/blog-feed'
import { platformUrl } from '@/lib/domains'

export const revalidate = 600

export async function GET() {
  const posts = await getPosts()
  const xml = buildBlogRss(posts, { origin: platformUrl('/').replace(/\/+$/, '') })
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
    },
  })
}
