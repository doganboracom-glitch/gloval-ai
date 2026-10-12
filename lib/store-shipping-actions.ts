'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOwnedEcommerceProject } from '@/lib/ecommerce-access'
import { scheduleShippedNotification } from '@/lib/store-order-notifications'
import {
  markOrderDelivered,
  shipOrder,
  type DeliverOutcome,
  type ShipOutcome,
  type ShippingOrderStore,
} from '@/lib/store-shipping-core'

/**
 * Owner actions that move an order through shipping. Ownership of the project
 * is proven first (owner or allow-listed admin); every order lookup and update
 * is scoped to that project, so another store's order id is "not_found".
 */

function supabaseShippingStore(): ShippingOrderStore {
  const admin = createAdminClient()
  return {
    async find(projectId, orderId) {
      const { data, error } = await admin
        .from('ecommerce_orders')
        .select('id, project_id, status, payment_status, payment_provider, shipping_status, shipped_at')
        .eq('id', orderId)
        .eq('project_id', projectId)
        .maybeSingle()
      if (error) {
        console.error('[store-shipping] order read failed', { code: error.code })
        return null
      }
      return data
    },
    async update(projectId, orderId, patch, whenShippingStatus) {
      let query = admin
        .from('ecommerce_orders')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('project_id', projectId)
        .not('status', 'in', '(cancelled,failed,refunded)')
      if (whenShippingStatus) query = query.in('shipping_status', whenShippingStatus)
      const { data, error } = await query.select('id')
      if (error) {
        console.error('[store-shipping] order update failed', { code: error.code })
        return 'error'
      }
      return data && data.length > 0 ? 'moved' : 'lost'
    },
  }
}

export async function shipStoreOrder(
  projectId: string,
  orderId: string,
  input: { carrier: string; trackingNumber: string; renotify?: boolean },
): Promise<ShipOutcome> {
  await requireOwnedEcommerceProject(projectId)
  const result = await shipOrder(supabaseShippingStore(), {
    projectId,
    orderId,
    carrier: input?.carrier,
    trackingNumber: input?.trackingNumber,
    renotify: input?.renotify === true,
  })
  if (result.ok) {
    if (result.notify) scheduleShippedNotification(orderId)
    revalidatePath(`/ecommerce/${projectId}/orders`)
  }
  return result
}

export async function markStoreOrderDelivered(
  projectId: string,
  orderId: string,
): Promise<DeliverOutcome> {
  await requireOwnedEcommerceProject(projectId)
  const result = await markOrderDelivered(supabaseShippingStore(), { projectId, orderId })
  if (result.ok) revalidatePath(`/ecommerce/${projectId}/orders`)
  return result
}
