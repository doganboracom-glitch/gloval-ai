import { listBlogPostsAction } from '@/lib/blog-actions'
import { noteServerTime } from '@/lib/blog-clock'
import type { BlogPost } from '@/lib/blog'

/** SWR key shared by the Blog tab, the preview and the starter-posts card. */
export const blogPostsKey = (projectId: string) => ['blog-posts', projectId] as const

/** One fetcher for every consumer of the key, so they always cache the same shape. */
export async function fetchBlogPosts(projectId: string): Promise<BlogPost[]> {
  const result = await listBlogPostsAction(projectId)
  if (!result.ok) throw new Error(result.reason)
  noteServerTime(result.serverNow)
  return result.posts
}
