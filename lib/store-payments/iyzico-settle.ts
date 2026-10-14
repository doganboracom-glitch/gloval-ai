import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { applyStorePaymentWebhook, type StoreWebhookDeps } from '@/lib/store-webhook-handler'
import { finalizePaidStock, releaseOrderStock, releaseOrderStockSafely } from '@/lib/store-order-stock'
import { scheduleOrderNotification } from '@/lib/store-order-notifications'
import {
  evaluateRetrieve,
  retrieveCheckoutForm,
  type FetchLike,
  type IyzicoCredentials,
} from '@/lib/store-payments/iyzico'
import { loadIyzicoCredentials } from '@/lib/store-payments/iyzico-credentials'

type Admin = ReturnType<typeof createAdminClient>

export type SettleOrder = {
  id: string
  project_id: string
  payment_status: string
  payment_ref: string | null
  total_cents: number
  currency: string
  created_at?: string
}

/**
 * - `paid` / `failed`: the order is now in that state (this call or an earlier one).
 * - `pending`: iyzico has no final answer yet.
 * - `unavailable`: iyzico could not be reached / refused our keys, or a database step failed
 *   (order left pending, nonce kept); nothing was lost and the next attempt settles it.
 * - `mismatch`: iyzico reported a payment that does not match the order; nothing changed.
 */
export type SettleOutcome = 'paid' | 'failed' | 'pending' | 'unavailable' | 'mismatch' | 'no_token'

const realDeps: StoreWebhookDeps = {
  finalizePaidStock,
  releaseOrderStock,
  notifyOrder: scheduleOrderNotification,
}

async function clearNonce(admin: Admin, orderId: string) {
  const { error } = await admin.from('ecommerce_orders').update({ payment_nonce: null }).eq('id', orderId)
  // Harmless to repeat (settling is idempotent), but worth a trace.
  if (error) console.error('[store-iyzico] nonce clear failed', { orderId, code: error.code })
}

/**
 * Asks iyzico (server to server, with THIS store's keys) what happened to the
 * order's checkout form and applies the answer. The paid transition is a
 * conditional update in `applyStorePaymentWebhook`, so calling this twice, or
 * from the callback and the reconciliation at once, takes stock and sends the
 * e-mail exactly once.
 */
export async function settleIyzicoOrder(
  admin: Admin,
  creds: IyzicoCredentials,
  order: SettleOrder,
  options: { fetchImpl?: FetchLike; deps?: StoreWebhookDeps } = {},
): Promise<SettleOutcome> {
  if (order.payment_status === 'paid') {
    await clearNonce(admin, order.id)
    return 'paid'
  }
  const token = order.payment_ref
  if (!token) return 'no_token'

  const retrieved = await retrieveCheckoutForm(creds, token, order.id, options.fetchImpl)
  const verdict = evaluateRetrieve(retrieved, {
    id: order.id,
    totalCents: order.total_cents,
    currency: order.currency,
  })
  const deps = options.deps ?? realDeps
  const scope = { projectId: order.project_id }

  switch (verdict.kind) {
    case 'unavailable':
      return 'unavailable'
    case 'pending':
      return 'pending'
    case 'mismatch':
      console.error('[store-iyzico] payment does not match order', {
        orderId: order.id,
        reason: verdict.reason,
      })
      return 'mismatch'
    case 'failed': {
      const res = await applyStorePaymentWebhook(
        admin,
        'iyzico',
        { reference: token, status: 'failed' },
        deps,
        scope,
      )
      if (res.outcome === 'error') return 'unavailable'
      if (res.outcome === 'ignored' && res.reason === 'already_paid') {
        await clearNonce(admin, order.id)
        return 'paid'
      }
      await clearNonce(admin, order.id)
      return 'failed'
    }
    case 'paid': {
      // Kept for the owner (shared with iyzico support); the order stays valid without it.
      const { error: paymentIdError } = await admin
        .from('ecommerce_orders')
        .update({ provider_payment_id: verdict.paymentId })
        .eq('id', order.id)
        .eq('project_id', order.project_id)
      if (paymentIdError) {
        console.error('[store-iyzico] provider payment id not saved', {
          orderId: order.id,
          code: paymentIdError.code,
        })
      }

      const res = await applyStorePaymentWebhook(
        admin,
        'iyzico',
        {
          reference: token,
          status: 'paid',
          paidAmountCents: verdict.paidPriceCents,
          paidCurrency: verdict.currency,
          amountMatch: 'at_least',
        },
        deps,
        scope,
      )
      if (res.outcome === 'error') return 'unavailable'
      if (res.outcome === 'paid' || res.outcome === 'duplicate') {
        await clearNonce(admin, order.id)
        return 'paid'
      }
      return 'mismatch'
    }
  }
}

/** iyzico checkout-form tokens live ~30 minutes; never judge an order before that. */
export const IYZICO_RECONCILE_AFTER_MS = 35 * 60 * 1000
/** An order iyzico still reports as undecided this long after creation is abandoned. */
export const IYZICO_ABANDON_AFTER_MS = 2 * 60 * 60 * 1000
export const IYZICO_RECONCILE_BATCH = 25

export type ReconcileSummary = {
  checked: number
  paid: number
  failed: number
  cancelled: number
  skipped: number
}

/**
 * Settles card orders whose buyer never came back (closed the tab). Bounded
 * (batch size + deadline), sequential and oldest first, so it stays inside the
 * cron's function time. An order is only cancelled when iyzico says it was not
 * paid; any network or key problem leaves it pending for the next run.
 */
export async function reconcileIyzicoOrders(
  admin: Admin,
  options: { deadlineMs: number; now?: number; fetchImpl?: FetchLike; deps?: StoreWebhookDeps } = {
    deadlineMs: Date.now() + 40_000,
  },
): Promise<ReconcileSummary> {
  const now = options.now ?? Date.now()
  const summary: ReconcileSummary = { checked: 0, paid: 0, failed: 0, cancelled: 0, skipped: 0 }
  const cutoff = new Date(now - IYZICO_RECONCILE_AFTER_MS).toISOString()

  const { data, error } = await admin
    .from('ecommerce_orders')
    .select('id, project_id, payment_status, payment_ref, total_cents, currency, created_at')
    .eq('status', 'pending')
    .eq('payment_status', 'pending')
    .eq('payment_provider', 'iyzico')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(IYZICO_RECONCILE_BATCH)
  if (error) {
    console.error('[store-iyzico] reconcile lookup failed', { code: error.code })
    return summary
  }

  const credsByProject = new Map<string, Awaited<ReturnType<typeof loadIyzicoCredentials>>>()
  const deps = options.deps ?? realDeps

  for (const order of (data ?? []) as SettleOrder[]) {
    if (Date.now() >= options.deadlineMs) break
    summary.checked += 1

    let loaded = credsByProject.get(order.project_id)
    if (!loaded) {
      loaded = await loadIyzicoCredentials(admin, order.project_id)
      credsByProject.set(order.project_id, loaded)
    }
    if (!loaded.ok) {
      summary.skipped += 1
      continue
    }

    const outcome = await settleIyzicoOrder(admin, loaded.creds, order, {
      fetchImpl: options.fetchImpl,
      deps,
    })

    if (outcome === 'paid') summary.paid += 1
    else if (outcome === 'failed') summary.failed += 1
    else if (outcome === 'no_token' || outcome === 'pending') {
      const age = now - new Date(order.created_at ?? now).getTime()
      if (outcome === 'no_token' || age >= IYZICO_ABANDON_AFTER_MS) {
        const { data: moved, error: cancelError } = await admin
          .from('ecommerce_orders')
          .update({ status: 'cancelled', payment_status: 'failed', payment_nonce: null })
          .eq('id', order.id)
          .eq('status', 'pending')
          .eq('payment_status', 'pending')
          .select('id')
        if (cancelError) {
          console.error('[store-iyzico] abandon cancel failed', { orderId: order.id, code: cancelError.code })
          summary.skipped += 1
        } else if (moved && moved.length > 0) {
          await releaseOrderStockSafely(admin, order.id, { onlyUnpaid: true })
          summary.cancelled += 1
        }
      } else {
        summary.skipped += 1
      }
    } else {
      summary.skipped += 1
    }
  }
  return summary
}
