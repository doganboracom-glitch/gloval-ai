import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

export type PersistIntentDeps = {
  finalizePaidStock: (admin: Admin, orderId: string) => Promise<{ oversold: boolean; stockFailed?: boolean }>
  releaseOrderStockSafely: (admin: Admin, orderId: string, options?: { onlyUnpaid?: boolean }) => Promise<unknown>
}

/**
 * Discards an order that never became valid. The idempotency key is retired so
 * a retry of the same checkout creates a fresh order instead of resolving to
 * this cancelled one.
 */
export async function voidOrder(admin: Admin, orderId: string, idempotencyKey: string): Promise<void> {
  const { error } = await admin
    .from('ecommerce_orders')
    .update({
      status: 'cancelled',
      payment_status: 'failed',
      idempotency_key: `${idempotencyKey}#void-${orderId}`,
    })
    .eq('id', orderId)
  if (error) console.error('[store-order] void did not save', { orderId, code: error.code })
}

/**
 * Saves what the payment provider returned for a freshly created order.
 *
 * - Synchronous settlement (mock provider only): marks the order paid.
 * - Otherwise stores the payment reference. Without it a later webhook can
 *   never find the order, so a failed save releases the reserved stock and
 *   voids the order instead of leaving a payable order nobody can settle.
 */
export async function persistPaymentIntent(
  admin: Admin,
  input: {
    orderId: string
    idempotencyKey: string
    intent: { action: string; status: string; reference: string }
  },
  deps: PersistIntentDeps,
): Promise<{ ok: true } | { ok: false; error: 'order_failed' }> {
  const { orderId, idempotencyKey, intent } = input

  if (intent.action === 'completed' && intent.status === 'paid') {
    const { error: paidError } = await admin
      .from('ecommerce_orders')
      .update({ status: 'paid', payment_status: 'paid', payment_ref: intent.reference })
      .eq('id', orderId)
    if (paidError) {
      console.error('[store-order] mark paid did not save', { orderId, code: paidError.code })
      await deps.releaseOrderStockSafely(admin, orderId)
      await voidOrder(admin, orderId, idempotencyKey)
      return { ok: false, error: 'order_failed' }
    }
    const stock = await deps.finalizePaidStock(admin, orderId)
    if (stock.stockFailed) {
      console.error('[store-order] paid order could not take stock', { orderId })
    }
    return { ok: true }
  }

  const { error: refError } = await admin
    .from('ecommerce_orders')
    .update({ payment_ref: intent.reference, payment_status: intent.status })
    .eq('id', orderId)
  if (refError) {
    console.error('[store-order] payment ref did not save', { orderId, code: refError.code })
    await deps.releaseOrderStockSafely(admin, orderId)
    await voidOrder(admin, orderId, idempotencyKey)
    return { ok: false, error: 'order_failed' }
  }
  return { ok: true }
}
