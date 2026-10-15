import { getPost } from '@/lib/content/blog'
import { renderOgImage } from '@/lib/seo/og-image'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) {
    return new Response('Not found', { status: 404 })
  }

  return renderOgImage({
    heading: post.title.tr ?? post.title.en,
    tagline: 'GLOVAL AI Blog',
  })
}
