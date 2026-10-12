import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProject } from '@/lib/projects'
import { listOwnerCustomers } from '@/lib/store-owner-customers'
import { CustomersClient } from '@/components/ecommerce/customers-client'

// Personal data, owner-only: never cache.
export const dynamic = 'force-dynamic'

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>
}) {
  const { projectId } = await params
  const query = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/ecommerce/${projectId}/customers`)

  const project = await getProject(projectId)
  if (!project) notFound()
  if (project.project_type !== 'ecommerce') notFound()

  const result = await listOwnerCustomers({
    projectId,
    q: typeof query.q === 'string' ? query.q : undefined,
    sort: typeof query.sort === 'string' ? query.sort : undefined,
    page: typeof query.page === 'string' ? query.page : undefined,
  })

  return (
    <CustomersClient
      projectId={projectId}
      result={result}
      q={typeof query.q === 'string' ? query.q.slice(0, 100) : ''}
      sort={typeof query.sort === 'string' ? query.sort : 'newest'}
    />
  )
}
