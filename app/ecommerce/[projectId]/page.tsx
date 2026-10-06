import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProject } from '@/lib/projects'
import { listProducts, listCategories } from '@/lib/ecommerce'
import { EcommerceClient } from '@/components/ecommerce/ecommerce-client'

// Per-user, auth-gated management data — never serve from a stale cache.
export const dynamic = 'force-dynamic'

export default async function EcommercePage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/ecommerce/${projectId}`)

  // Ownership is enforced by getProject (RLS) — a non-owned or missing id 404s.
  const project = await getProject(projectId)
  if (!project) notFound()
  // Only e-commerce projects have a product catalog.
  if (project.project_type !== 'ecommerce') notFound()

  const [products, categories] = await Promise.all([
    listProducts(projectId),
    listCategories(projectId),
  ])

  return (
    <EcommerceClient
      projectId={projectId}
      projectName={project.name}
      initialProducts={products}
      initialCategories={categories}
      storeSlug={project.slug}
      published={project.published}
    />
  )
}
