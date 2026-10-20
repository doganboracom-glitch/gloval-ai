import { requireAdmin } from '@/lib/mail/admin-guard'
import { listAdminPosts } from '@/lib/blog-admin'
import { PostsView } from '@/components/admin/blog/posts-view'

export const dynamic = 'force-dynamic'

export default async function AdminBlogPage() {
  await requireAdmin()
  const { posts, categories } = await listAdminPosts()
  return <PostsView posts={posts} categories={categories} />
}
