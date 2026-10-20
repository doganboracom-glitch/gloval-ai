import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/mail/admin-guard'
import { getAdminPost, listAdminCategories } from '@/lib/blog-admin'
import { PostEditor } from '@/components/admin/blog/post-editor'

export const dynamic = 'force-dynamic'

export default async function AdminEditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const [post, categories] = await Promise.all([getAdminPost(id), listAdminCategories()])
  if (!post) notFound()
  return (
    <PostEditor
      key={`${post.input.id}:${post.updatedAt}`}
      initial={post.input}
      oldSlugs={post.oldSlugs}
      visibility={post.visibility}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
    />
  )
}
