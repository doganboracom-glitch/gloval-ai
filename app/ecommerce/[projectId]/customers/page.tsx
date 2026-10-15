import { notFound, redirect } from 'next/navigation'
import { loadProjectCommerce } from '@/lib/commerce-mode-server'
import { getProject } from '@/lib/projects'
import { resolveCustomersPageAccess } from '@/lib/store-customers-page-access'
import { listOwnerCustomers } from '@/lib/store-owner-customers'
import { CustomersClient } from '@/components/ecommerce/customers-client'

// Personal data, owner-only: never cache.
export const dynamic = 'force-dynamic'

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ q?: string; sort?: string; page?: string; status?: string }>
}) {
  const { projectId } = await params
  const query = await searchParams

  const access = await resolveCustomersPageAccess(projectId)
  if (access === 'login') redirect(`/auth/login?next=/ecommerce/${projectId}/customers`)
  if (access === 'not_found') notFound()

  const project = await getProject(projectId)
  if (!project) notFound()
  if ((await loadProjectCommerce({ id: projectId }))?.mode !== 'ecommerce') notFound()

  const result = await listOwnerCustomers({
    projectId,
    q: typeof query.q === 'string' ? query.q : undefined,
    sort: typeof query.sort === 'string' ? query.sort : undefined,
    page: typeof query.page === 'string' ? query.page : undefined,
    status: typeof query.status === 'string' ? query.status : undefined,
  })

  return (
    <CustomersClient
      projectId={projectId}
      result={result}
      q={typeof query.q === 'string' ? query.q.slice(0, 100) : ''}
      sort={typeof query.sort === 'string' ? query.sort : 'newest'}
      status={result.ok ? result.status : 'active'}
    />
  )
}
