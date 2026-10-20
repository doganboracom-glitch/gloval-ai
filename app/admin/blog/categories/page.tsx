import { requireAdmin } from '@/lib/mail/admin-guard'
import { listAdminCategories } from '@/lib/blog-admin'
import { CategoriesView } from '@/components/admin/blog/categories-view'

export const dynamic = 'force-dynamic'

export default async function AdminBlogCategoriesPage() {
  await requireAdmin()
  const categories = await listAdminCategories()
  return <CategoriesView categories={categories} />
}
