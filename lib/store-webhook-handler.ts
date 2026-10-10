import type { createAdminClient } from '@/lib/supabase/admin'
import type { PaymentProviderId, PaymentWebhookResult } from '@/lib/payments/types'
import { checkPaidAmount, type AmountCheckFailure } from '@/lib/store-webhook-rules'

type Admin = ReturnType<typeof createAdminClient>

export type StoreWebhookDeps = {
  finalizePaidStock: (admin: Admin, orderId: string) => Promise<{ oversold: boolean }>
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
): Promise<StoreWebhookOutcome> {
  const { data: order } = await admin
    .from('ecommerce_orders')
    .select('id, payment_status, total_cents, currency')
    .eq('payment_ref', result.reference)
    .eq('payment_provider', providerId)
    .maybeSingle()

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

    const { data: moved } = await admin
      .from('ecommerce_orders')
      .update({ payment_status: 'paid', status: 'paid' })
      .eq('id', order.id)
      .neq('payment_status', 'paid')
      .neq('payment_status', 'refunded')
      .select('id')

    // Another delivery won the race: it owns the side effects.
    if (!moved || moved.length === 0) return { outcome: 'duplicate' }

    const { oversold } = await deps.finalizePaidStock(admin, order.id)
    deps.notifyOrder(order.id)
    return { outcome: 'paid', oversold }
  }

  if (result.status === 'failed') {
    if (order.payment_status === 'paid') return { outcome: 'ignored', reason: 'already_paid' }
    if (order.payment_status === 'refunded') {
      return { outcome: 'ignored', reason: 'already_refunded' }
    }

    if (order.payment_status === 'failed') return { outcome: 'duplicate' }

    const { data: moved } = await admin
      .from('ecommerce_orders')
      .update({ payment_status: 'failed', status: 'failed' })
      .eq('id', order.id)
      .neq('payment_status', 'paid')
      .neq('payment_status', 'refunded')
      .neq('payment_status', 'failed')
      .select('id')

    if (!moved || moved.length === 0) return { outcome: 'duplicate' }

    await deps.releaseOrderStock(admin, order.id, { onlyUnpaid: true })
    return { outcome: 'failed' }
  }

  // refunded: only a paid order can be refunded.
  if (order.payment_status === 'refunded') return { outcome: 'duplicate' }
  if (order.payment_status !== 'paid') return { outcome: 'ignored', reason: 'not_paid' }

  const { data: moved } = await admin
    .from('ecommerce_orders')
    .update({ payment_status: 'refunded', status: 'refunded' })
    .eq('id', order.id)
    .eq('payment_status', 'paid')
    .select('id')

  if (!moved || moved.length === 0) return { outcome: 'duplicate' }
  return { outcome: 'refunded' }
}
