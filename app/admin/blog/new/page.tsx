import { requireAdmin } from '@/lib/mail/admin-guard'
import { listAdminCategories } from '@/lib/blog-admin'
import { EMPTY_POST, PostEditor } from '@/components/admin/blog/post-editor'

export const dynamic = 'force-dynamic'

export default async function AdminNewBlogPostPage() {
  await requireAdmin()
  const categories = await listAdminCategories()
  return <PostEditor initial={EMPTY_POST} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
}
