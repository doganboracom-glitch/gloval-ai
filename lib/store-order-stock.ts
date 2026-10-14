import 'server-only'

import { revalidatePath } from 'next/cache'
import type { createAdminClient } from '@/lib/supabase/admin'
import { revalidateStorefront } from '@/lib/store-revalidate'
import { isMissingColumnError, isMissingFunctionError } from '@/lib/store-schema-compat'

type Admin = ReturnType<typeof createAdminClient>

/** Stock shown on the live pages changed: refresh the order's store (never throws). */
export function refreshStorefrontForOrder(admin: Admin, orderId: string): Promise<void> {
  return revalidateStorefront(
    {
      findSlug: async (id) => {
        const { data: order, error: orderError } = await admin
          .from('ecommerce_orders')
          .select('project_id')
          .eq('id', id)
          .maybeSingle()
        if (orderError) {
          console.error('[store-stock] revalidate order lookup failed', { code: orderError.code })
          return null
        }
        if (!order?.project_id) return null
        const { data: project, error: projectError } = await admin
          .from('projects')
          .select('slug')
          .eq('id', order.project_id as string)
          .maybeSingle()
        if (projectError) {
          console.error('[store-stock] revalidate project lookup failed', { code: projectError.code })
          return null
        }
        return typeof project?.slug === 'string' && project.slug ? project.slug : null
      },
      revalidatePath,
    },
    orderId,
  )
}

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
  if (res?.ok) {
    if (!res.already) await refreshStorefrontForOrder(admin, orderId)
    return { ok: true, mode: 'atomic', already: Boolean(res.already) }
  }
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
    throw new StockReleaseError(error.code ?? 'unknown')
  }
  if (!error) await refreshStorefrontForOrder(admin, orderId)
}

/** A release the database refused. The stock stays reserved until a retry or the orphan sweep. */
export class StockReleaseError extends Error {
  constructor(readonly code: string) {
    super(`stock_release_failed:${code}`)
    this.name = 'StockReleaseError'
  }
}

/**
 * Release for call sites that have already settled the order and must not
 * abort on a stock error (voiding a checkout, cancelling). Returns false when
 * the stock is still reserved; `releaseOrphanedStock` gives it back later.
 */
export async function releaseOrderStockSafely(
  admin: Admin,
  orderId: string,
  options: { onlyUnpaid?: boolean } = {},
): Promise<boolean> {
  try {
    await releaseOrderStock(admin, orderId, options)
    return true
  } catch {
    return false
  }
}

const ORPHAN_SWEEP_LIMIT = 50

/**
 * Self-healing for a release that failed after the order was already
 * cancelled/failed: those orders are never visited again by the pending-order
 * sweeps, so their reserved stock would stay locked forever. Idempotent and
 * `onlyUnpaid`, so it can never take stock from a paid order.
 */
export async function releaseOrphanedStock(admin: Admin, projectId: string | null): Promise<number> {
  let query = admin
    .from('ecommerce_orders')
    .select('id')
    .eq('stock_reserved', true)
    .eq('payment_status', 'failed')
    .in('status', ['cancelled', 'failed'])
    .limit(ORPHAN_SWEEP_LIMIT)
  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) {
    if (!isMissingColumnError(error)) {
      console.error('[store-stock] orphan lookup failed', { code: error.code })
    }
    return 0
  }
  let released = 0
  for (const row of (data ?? []) as { id: string }[]) {
    if (await releaseOrderStockSafely(admin, row.id, { onlyUnpaid: true })) released++
  }
  return released
}

const STALE_ONLINE_ORDER_MS = 2 * 60 * 60 * 1000

/**
 * Cancels abandoned unpaid ONLINE-payment orders (card PSP checkouts never
 * completed) and returns their stock. Manual methods (bank transfer, cash on
 * delivery) are excluded: they wait for a human and expire on their own
 * schedule (`expireStaleManualOrders`).
 *
   * Done in application code rather than through the `release_stale_order_stock`
   * SQL function so the manual-method exclusion holds even where scripts/035
   * has not been applied (the 032 version only exempts bank transfers and would
   * cancel pending cash-on-delivery orders after two hours). 035 makes the SQL
   * function exclude both manual methods too, matching this implementation.
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
    // iyzico orders are judged by iyzico itself (reconcileIyzicoOrders), never by age alone:
    // a buyer may have paid and closed the tab.
    .not('payment_provider', 'in', '(bank_transfer,cash_on_delivery,iyzico)')
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
    const { data: moved, error: moveError } = await admin
      .from('ecommerce_orders')
      .update({ status: 'cancelled' })
      .eq('id', row.id)
      .eq('status', 'pending')
      .eq('payment_status', 'pending')
      .select('id')
    if (moveError) {
      console.error('[store-stock] stale cancel failed', { orderId: row.id, code: moveError.code })
      continue
    }
    if (moved && moved.length > 0) {
      await releaseOrderStockSafely(admin, row.id, { onlyUnpaid: true })
    }
  }

  await releaseOrphanedStock(admin, projectId)
}

/**
 * Pre-migration fallback: optimistic compare-and-swap decrement so concurrent
 * writers cannot silently overwrite each other's update. Clamps at zero.
 */
async function legacyDecrementForOrder(admin: Admin, orderId: string): Promise<boolean> {
  const { data: items, error: itemsError } = await admin
    .from('ecommerce_order_items')
    .select('product_id, quantity')
    .eq('order_id', orderId)
  // Nothing has been decremented yet, so the caller can safely retry.
  if (itemsError) {
    console.error('[store-stock] legacy items lookup failed', { orderId, code: itemsError.code })
    throw new StockReleaseError(itemsError.code ?? 'unknown')
  }

  let complete = true
  for (const item of items ?? []) {
    if (!item.product_id) continue
    let done = false
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      const { data: product, error: productError } = await admin
        .from('ecommerce_products')
        .select('stock')
        .eq('id', item.product_id)
        .maybeSingle()
      if (productError) {
        console.error('[store-stock] legacy product lookup failed', { orderId, code: productError.code })
        break
      }
      if (!product) {
        done = true
        break
      }
      const { data: updated, error: updateError } = await admin
        .from('ecommerce_products')
        .update({ stock: Math.max(0, product.stock - item.quantity) })
        .eq('id', item.product_id)
        .eq('stock', product.stock)
        .select('id')
      if (updateError) {
        console.error('[store-stock] legacy decrement failed', { orderId, code: updateError.code })
        break
      }
      if (updated && updated.length > 0) done = true
    }
    if (!done) complete = false
  }
  return complete
}

/**
 * Runs exactly once per order, on the transition into "paid". With the
 * migration applied the stock was already reserved at checkout, so this is a
 * no-op; for legacy/unreserved/released orders it takes the stock now. A
 * payment that is already captured is never refused: if stock ran out in the
 * meantime the order is reported as oversold for the owner to resolve.
 */
export type FinalizeStockResult = {
  oversold: boolean
  /**
   * The database could not take the stock (an error, not a shortage). The
   * caller must not treat the order as fulfilled; `reserve_order_stock` is
   * idempotent per order, so retrying cannot take the stock twice.
   */
  stockFailed?: boolean
}

export async function finalizePaidStock(admin: Admin, orderId: string): Promise<FinalizeStockResult> {
  const reserved = await reserveOrderStock(admin, orderId)
  if (reserved.ok && reserved.mode === 'legacy') {
    const complete = await legacyDecrementForOrder(admin, orderId)
    await refreshStorefrontForOrder(admin, orderId)
    return complete ? { oversold: false } : { oversold: false, stockFailed: true }
  }
  if (!reserved.ok) {
    const oversold = reserved.error === 'insufficient_stock'
    console.error('[store-stock] paid order could not take stock', {
      orderId,
      reason: reserved.error,
      productId: reserved.error === 'insufficient_stock' ? reserved.productId : null,
    })
    return oversold ? { oversold } : { oversold: false, stockFailed: true }
  }
  return { oversold: false }
}
