import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildNotificationScrubPatch,
  isSafeOrderId,
  orderNotificationOrFilter,
} from '@/lib/store-customer-privacy'

/**
 * Clears personal free text from the notification log rows of ONE deleted store
 * customer. Rows are found through the customer's own orders (dedupe keys are
 * `store-order:<orderId>:<role>`), never by e-mail address, so another customer
 * or another project can't be touched. Only `body` is cleared: `dedupe_key`,
 * `type`, `status` and `created_at` stay, so an order e-mail that already went
 * out can never be claimed (and sent) a second time.
 *
 * Idempotent and keyed by ids only, so it can be re-run at any time after the
 * account was anonymized. Orders and their own snapshots are never modified.
 */

const ORDER_ID_CHUNK = 40
const ORDER_ID_LIMIT = 5000
const ATTEMPTS = 2

export type ScrubResult = { ok: true; scrubbed: number } | { ok: false }

async function scrubOnce(projectId: string, customerId: string): Promise<number> {
  const admin = createAdminClient()

  const { data: orders, error: ordersError } = await admin
    .from('ecommerce_orders')
    .select('id')
    .eq('project_id', projectId)
    .eq('customer_id', customerId)
    .limit(ORDER_ID_LIMIT)
  if (ordersError) throw new Error(ordersError.code ?? 'orders_read_failed')

  const orderIds = (Array.isArray(orders) ? orders : [])
    .map((o) => (o as { id?: unknown }).id)
    .filter(isSafeOrderId)

  let scrubbed = 0
  for (let i = 0; i < orderIds.length; i += ORDER_ID_CHUNK) {
    const chunk = orderIds.slice(i, i + ORDER_ID_CHUNK)
    const { data, error } = await admin
      .from('notification_logs')
      .update(buildNotificationScrubPatch())
      .or(orderNotificationOrFilter(chunk))
      .like('type', 'store_*')
      .not('body', 'is', null)
      .select('id')
    if (error) throw new Error(error.code ?? 'notification_update_failed')
    scrubbed += Array.isArray(data) ? data.length : 0
  }
  return scrubbed
}

/** Never throws. Retries once; on failure logs ids only and reports `{ ok: false }`. */
export async function scrubCustomerNotificationLogs(projectId: string, customerId: string): Promise<ScrubResult> {
  let lastError = 'unknown'
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      return { ok: true, scrubbed: await scrubOnce(projectId, customerId) }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'unknown'
    }
  }
  console.log('[v0] customer notification scrub failed (safe to retry):', projectId, customerId, lastError)
  return { ok: false }
}
