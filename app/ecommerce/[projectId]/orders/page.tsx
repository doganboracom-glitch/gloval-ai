import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProject } from '@/lib/projects'
import { listOrders } from '@/lib/ecommerce'
import { getShippingSettings } from '@/lib/store-payments/shipping-settings'
import { deletedCustomerOrderIds } from '@/lib/store-customer-deletion'
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
  const deletedOrderIds = [
    ...(await deletedCustomerOrderIds(
      projectId,
      orders.map((o) => o.id),
    )),
  ]
  const defaultCarrier = await getShippingSettings(projectId)
    .then((view) => view.settings.defaultCarrier)
    .catch(() => null)

  return (
    <OrdersClient
      projectId={projectId}
      projectName={project.name}
      initialOrders={orders}
      defaultCarrier={defaultCarrier}
      deletedOrderIds={deletedOrderIds}
    />
  )
}
