import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import { isMissingFunctionError } from '@/lib/store-schema-compat'

type Admin = ReturnType<typeof createAdminClient>

export type ReserveResult =
  | { ok: true; mode: 'atomic'; already: boolean }
  | { ok: true; mode: 'legacy' }
  | { ok: false; error: 'insufficient_stock'; productId: string | null }
  | { ok: false; error: 'stock_failed' }

type RpcReserve = {
  ok?: boolean
  already?: boolean
  error?: string
  product_id?: string | null
}

/**
 * Atomically takes an order's stock in ONE database transaction
 * (`reserve_order_stock`). Idempotent per order via `stock_reserved`.
 * Returns mode 'legacy' when the migration has not been applied yet — the
 * caller then keeps the pre-migration behavior.
 */
export async function reserveOrderStock(admin: Admin, orderId: string): Promise<ReserveResult> {
  const { data, error } = await admin.rpc('reserve_order_stock', { p_order_id: orderId })
  if (error) {
    if (isMissingFunctionError(error)) return { ok: true, mode: 'legacy' }
    console.error('[store-stock] reserve failed', { orderId, code: error.code })
    return { ok: false, error: 'stock_failed' }
  }
  const res = (data ?? null) as RpcReserve | null
  if (res?.ok) return { ok: true, mode: 'atomic', already: Boolean(res.already) }
  if (res?.error === 'insufficient_stock') {
    return { ok: false, error: 'insufficient_stock', productId: res.product_id ?? null }
  }
  return { ok: false, error: 'stock_failed' }
}

/**
 * Gives an order's reserved stock back. Idempotent: a second call (or a call
 * for an order that never reserved) changes nothing. `onlyUnpaid` makes the
 * database re-check the payment status under the row lock, so a late "paid"
 * can never lose its stock to a concurrent release.
 */
export async function releaseOrderStock(
  admin: Admin,
  orderId: string,
  options: { onlyUnpaid?: boolean } = {},
): Promise<void> {
  const { error } = await admin.rpc('release_order_stock', {
    p_order_id: orderId,
    p_only_unpaid: options.onlyUnpaid ?? false,
  })
  if (error && !isMissingFunctionError(error)) {
    console.error('[store-stock] release failed', { orderId, code: error.code })
  }
}

const STALE_ONLINE_ORDER_MS = 2 * 60 * 60 * 1000

/**
 * Cancels abandoned unpaid ONLINE-payment orders (card PSP checkouts never
 * completed) and returns their stock. Manual methods (bank transfer, cash on
 * delivery) are excluded: they wait for a human and expire on their own
 * schedule (`expireStaleManualOrders`).
 *
 * Done in application code rather than through the `release_stale_order_stock`
 * SQL function so the manual-method exclusion holds even before scripts/034
 * changes that function (the 032 version only exempts bank transfers and would
 * cancel pending cash-on-delivery orders after two hours).
 */
export async function releaseStaleOrderStock(
  admin: Admin,
  projectId: string | null,
  now: number = Date.now(),
): Promise<void> {
  const cutoff = new Date(now - STALE_ONLINE_ORDER_MS).toISOString()
  let query = admin
    .from('ecommerce_orders')
    .select('id')
    .eq('status', 'pending')
    .eq('payment_status', 'pending')
    .not('payment_provider', 'in', '(bank_transfer,cash_on_delivery)')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(200)
  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) {
    console.error('[store-stock] stale lookup failed', { code: error.code })
    return
  }

  for (const row of (data ?? []) as { id: string }[]) {
    const { data: moved } = await admin
      .from('ecommerce_orders')
      .update({ status: 'cancelled' })
      .eq('id', row.id)
      .eq('status', 'pending')
      .eq('payment_status', 'pending')
      .select('id')
    if (moved && moved.length > 0) {
      await releaseOrderStock(admin, row.id, { onlyUnpaid: true })
    }
  }
}

/**
 * Pre-migration fallback: optimistic compare-and-swap decrement so concurrent
 * writers cannot silently overwrite each other's update. Clamps at zero.
 */
async function legacyDecrementForOrder(admin: Admin, orderId: string): Promise<void> {
  const { data: items } = await admin
    .from('ecommerce_order_items')
    .select('product_id, quantity')
    .eq('order_id', orderId)

  for (const item of items ?? []) {
    if (!item.product_id) continue
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: product } = await admin
        .from('ecommerce_products')
        .select('stock')
        .eq('id', item.product_id)
        .maybeSingle()
      if (!product) break
      const { data: updated } = await admin
        .from('ecommerce_products')
        .update({ stock: Math.max(0, product.stock - item.quantity) })
        .eq('id', item.product_id)
        .eq('stock', product.stock)
        .select('id')
      if (updated && updated.length > 0) break
    }
  }
}

/**
 * Runs exactly once per order, on the transition into "paid". With the
 * migration applied the stock was already reserved at checkout, so this is a
 * no-op; for legacy/unreserved/released orders it takes the stock now. A
 * payment that is already captured is never refused: if stock ran out in the
 * meantime the order is reported as oversold for the owner to resolve.
 */
export async function finalizePaidStock(
  admin: Admin,
  orderId: string,
): Promise<{ oversold: boolean }> {
  const reserved = await reserveOrderStock(admin, orderId)
  if (reserved.ok && reserved.mode === 'legacy') {
    await legacyDecrementForOrder(admin, orderId)
    return { oversold: false }
  }
  if (!reserved.ok) {
    const oversold = reserved.error === 'insufficient_stock'
    console.error('[store-stock] paid order could not take stock', {
      orderId,
      reason: reserved.error,
      productId: reserved.error === 'insufficient_stock' ? reserved.productId : null,
    })
    return { oversold }
  }
  return { oversold: false }
}
