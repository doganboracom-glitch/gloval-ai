import type { createAdminClient } from '@/lib/supabase/admin'
import type { PaymentProviderId, PaymentWebhookResult } from '@/lib/payments/types'
import { checkPaidAmount, type AmountCheckFailure } from '@/lib/store-webhook-rules'

type Admin = ReturnType<typeof createAdminClient>

export type StoreWebhookDeps = {
  finalizePaidStock: (
    admin: Admin,
    orderId: string,
  ) => Promise<{ oversold: boolean; stockFailed?: boolean }>
  releaseOrderStock: (
    admin: Admin,
    orderId: string,
    options?: { onlyUnpaid?: boolean },
  ) => Promise<void>
  notifyOrder: (orderId: string) => void
}

export type StoreWebhookOutcome =
  | { outcome: 'order_not_found' }
  | { outcome: 'rejected'; reason: AmountCheckFailure }
  | { outcome: 'duplicate' }
  | { outcome: 'ignored'; reason: 'already_paid' | 'already_refunded' | 'not_paid' }
  | { outcome: 'paid'; oversold: boolean }
  | { outcome: 'failed' }
  | { outcome: 'refunded' }
  /**
   * A database call failed. NOTHING was silently skipped: the caller must
   * answer with a retryable failure so the provider redelivers (or the
   * reconciliation picks the order up again).
   */
  | { outcome: 'error'; step: StoreWebhookErrorStep }

export type StoreWebhookErrorStep =
  | 'lookup'
  | 'mark_paid'
  | 'take_stock'
  | 'mark_failed'
  | 'release_stock'
  | 'mark_refunded'

function failedStep(
  providerId: string,
  orderId: string | null,
  step: StoreWebhookErrorStep,
  code: string | undefined,
): StoreWebhookOutcome {
  console.error('[store-webhook] database step failed', { provider: providerId, orderId, step, code })
  return { outcome: 'error', step }
}

/**
 * Applies a VERIFIED provider callback to a store order.
 *
 * - The order is located by payment reference AND provider, so a reference
 *   issued by one provider can never settle an order created for another.
 * - A paid callback is cross-checked against the server-side order amount and
 *   currency before anything is fulfilled.
 * - Every transition is a conditional update. The side effects (stock, email)
 *   run only for the request whose update actually changed the row, so
 *   duplicate or concurrent deliveries cannot double-take stock or double-mail.
 * - A settled order is never overwritten by a lesser state: a late "failed"
 *   cannot undo "paid", and nothing can leave "refunded".
 */
export async function applyStorePaymentWebhook(
  admin: Admin,
  providerId: PaymentProviderId,
  result: Pick<
    PaymentWebhookResult,
    'reference' | 'status' | 'paidAmountCents' | 'paidCurrency' | 'amountMatch'
  >,
  deps: StoreWebhookDeps,
  scope: { projectId?: string } = {},
): Promise<StoreWebhookOutcome> {
  let lookup = admin
    .from('ecommerce_orders')
    .select('id, payment_status, status, total_cents, currency')
    .eq('payment_ref', result.reference)
    .eq('payment_provider', providerId)
  // Per-store callbacks (a provider using the owner's own keys) must only ever
  // settle an order of THAT store.
  if (scope.projectId) lookup = lookup.eq('project_id', scope.projectId)
  const { data: order, error: lookupError } = await lookup.maybeSingle()
  // A failed lookup is not "no such order": answering 404 would stop the provider retrying.
  if (lookupError) return failedStep(providerId, null, 'lookup', lookupError.code)

  if (!order) return { outcome: 'order_not_found' }

  if (result.status === 'paid') {
    if (order.payment_status === 'paid') return { outcome: 'duplicate' }
    if (order.payment_status === 'refunded') {
      return { outcome: 'ignored', reason: 'already_refunded' }
    }

    const failure = checkPaidAmount(result, {
      total_cents: order.total_cents,
      currency: order.currency,
    })
    if (failure) {
      console.error('[store-webhook] paid callback rejected', {
        provider: providerId,
        orderId: order.id,
        reason: failure,
      })
      return { outcome: 'rejected', reason: failure }
    }

    const { data: moved, error: paidError } = await admin
      .from('ecommerce_orders')
      .update({ payment_status: 'paid', status: 'paid' })
      .eq('id', order.id)
      .neq('payment_status', 'paid')
      .neq('payment_status', 'refunded')
      .select('id')
    // The order stays as it was (pending), so a redelivery or the reconciliation settles it.
    if (paidError) return failedStep(providerId, order.id, 'mark_paid', paidError.code)

    // Another delivery won the race: it owns the side effects.
    if (!moved || moved.length === 0) return { outcome: 'duplicate' }

    let stock: { oversold: boolean; stockFailed?: boolean }
    try {
      stock = await deps.finalizePaidStock(admin, order.id)
    } catch (err) {
      stock = { oversold: false, stockFailed: true }
      console.error('[store-webhook] take stock threw', {
        orderId: order.id,
        message: err instanceof Error ? err.name : 'unknown',
      })
    }
    if (stock.stockFailed) {
      // Hand the order back to the retry path: no email, and the next delivery
      // re-runs the (per-order idempotent) stock step instead of seeing "duplicate".
      const { error: revertError } = await admin
        .from('ecommerce_orders')
        .update({ payment_status: order.payment_status, status: order.status })
        .eq('id', order.id)
        .eq('payment_status', 'paid')
      if (revertError) {
        console.error('[store-webhook] revert after stock failure failed', {
          orderId: order.id,
          code: revertError.code,
        })
      }
      return failedStep(providerId, order.id, 'take_stock', undefined)
    }
    deps.notifyOrder(order.id)
    return { outcome: 'paid', oversold: stock.oversold }
  }

  if (result.status === 'failed') {
    if (order.payment_status === 'paid') return { outcome: 'ignored', reason: 'already_paid' }
    if (order.payment_status === 'refunded') {
      return { outcome: 'ignored', reason: 'already_refunded' }
    }

    if (order.payment_status === 'failed') return { outcome: 'duplicate' }

    const { data: moved, error: failError } = await admin
      .from('ecommerce_orders')
      .update({ payment_status: 'failed', status: 'failed' })
      .eq('id', order.id)
      .neq('payment_status', 'paid')
      .neq('payment_status', 'refunded')
      .neq('payment_status', 'failed')
      .select('id')
    if (failError) return failedStep(providerId, order.id, 'mark_failed', failError.code)

    if (!moved || moved.length === 0) return { outcome: 'duplicate' }

    try {
      await deps.releaseOrderStock(admin, order.id, { onlyUnpaid: true })
    } catch (err) {
      // The order is already failed; the orphan sweep returns the reserved stock.
      return failedStep(
        providerId,
        order.id,
        'release_stock',
        err instanceof Error ? err.message : undefined,
      )
    }
    return { outcome: 'failed' }
  }

  // refunded: only a paid order can be refunded.
  if (order.payment_status === 'refunded') return { outcome: 'duplicate' }
  if (order.payment_status !== 'paid') return { outcome: 'ignored', reason: 'not_paid' }

  const { data: moved, error: refundError } = await admin
    .from('ecommerce_orders')
    .update({ payment_status: 'refunded', status: 'refunded' })
    .eq('id', order.id)
    .eq('payment_status', 'paid')
    .select('id')
  if (refundError) return failedStep(providerId, order.id, 'mark_refunded', refundError.code)

  if (!moved || moved.length === 0) return { outcome: 'duplicate' }
  return { outcome: 'refunded' }
}
