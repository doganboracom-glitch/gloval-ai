import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProject } from '@/lib/projects'
import { listOrders } from '@/lib/ecommerce'
import { OrdersClient } from '@/components/ecommerce/orders-client'

// Per-user, auth-gated order data — never serve from a stale cache.
export const dynamic = 'force-dynamic'

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/ecommerce/${projectId}/orders`)

  const project = await getProject(projectId)
  if (!project) notFound()
  if (project.project_type !== 'ecommerce') notFound()

  const orders = await listOrders(projectId)

  return (
    <OrdersClient
      projectId={projectId}
      projectName={project.name}
      initialOrders={orders}
    />
  )
}
