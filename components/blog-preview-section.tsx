import { BlogPreviewView } from '@/components/blog-preview'
import { getFeaturedPosts } from '@/lib/content/blog'

/** Homepage blog strip: server-fetched featured posts, list fields only. */
export async function BlogPreview() {
  const posts = await getFeaturedPosts(3)
  return <BlogPreviewView posts={posts} />
}
