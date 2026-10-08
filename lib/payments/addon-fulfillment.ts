import { createAdminClient } from '@/lib/supabase/admin'
import { logUserEvent, formatTicketNumber } from '@/lib/notify'
import { isAddOnCode, resolveAddOnPrices, type AddOnPlanRow } from '@/lib/add-ons'
import { addOnGrantKey, addOnLedgerKey, type AddOnPurchaseStatus } from '@/lib/addon-purchases'
import {
  verifyAddOnFulfillmentContext,
  verifyAddOnPaymentFacts,
  type AddOnRejectReason,
  type AddOnSubscriptionFacts,
} from './addon-verify'
import type { PaymentProviderId, PaymentWebhookResult } from './types'

type AdminClient = ReturnType<typeof createAdminClient>

type PurchaseRow = {
  id: string
  user_id: string
  subscription_id: string
  addon_code: string
  amount: number
  currency: string
  status: string
  provider_ref: string | null
}

/**
 * - `granted`: this call created the entitlement and moved the row to `granted`.
 * - `already_settled`: the row was already `granted`/`manual_refund_required`, or a
 *   concurrent callback finished it; nothing was changed.
 * - `failed`: the provider reported a failed payment for an unpaid purchase.
 * - `manual_refund_required`: money was taken but no entitlement may be given.
 * - `retry_pending`: payment is verified and recorded as `paid`, fulfilment could
 *   not be completed safely right now; a later callback retries it.
 * - `ignored`: the result carries nothing to act on (e.g. a refund event).
 */
export type AddOnSettleOutcome =
  | 'granted'
  | 'already_settled'
  | 'failed'
  | 'manual_refund_required'
  | 'retry_pending'
  | 'ignored'

const PURCHASE_COLUMNS = 'id, user_id, subscription_id, addon_code, amount, currency, status, provider_ref'

/**
 * Conditional status move. Returns true only for the caller that actually
 * flipped the row, which is what makes every side effect run exactly once.
 */
async function transition(
  admin: AdminClient,
  purchaseId: string,
  from: AddOnPurchaseStatus[],
  to: AddOnPurchaseStatus,
): Promise<boolean> {
  const { data, error } = await admin
    .from('addon_purchases')
    .update({ status: to })
    .eq('id', purchaseId)
    .in('status', from)
    .select('id')
  if (error) throw new Error(`addon_transition_failed: ${error.message}`)
  return (data?.length ?? 0) > 0
}

async function safeNotify(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.log('[v0] settleAddOnResult: notification failed', err instanceof Error ? err.message : err)
  }
}

/**
 * The buyer was charged but must not receive the entitlement. The `addon_purchases`
 * table has no reason column, so the reason travels in the log and the admin
 * e-mail, where a human decides on the refund.
 */
async function rejectForRefund(
  admin: AdminClient,
  purchase: PurchaseRow,
  reason: AddOnRejectReason | string,
  from: AddOnPurchaseStatus[],
  reference: string,
): Promise<AddOnSettleOutcome> {
  console.log('[v0] settleAddOnResult: not fulfilling, manual refund required', {
    purchaseId: purchase.id,
    reason,
  })
  const flipped = await transition(admin, purchase.id, from, 'manual_refund_required')
  if (flipped) {
    await safeNotify(() =>
      logUserEvent({
        userId: purchase.user_id,
        type: 'payment_failed',
        subject: 'Ek hizmet ödemeniz alındı ancak etkinleştirilemedi',
        body: `Ek hizmet ödemeniz alındı fakat hizmet etkinleştirilemedi. Destek ekibimiz inceleyip ödemenizi iade edecek veya düzeltecek. İşlem No: ${formatTicketNumber(reference)}.`,
        emailAdmin: true,
        adminSubject: (userEmail) => `${userEmail} üye ek hizmet ödemesi: manuel iade gerekli`,
        adminBody: (userEmail) =>
          `Kullanıcı e-posta adresi: ${userEmail}\nSatın alma: ${purchase.id}\nEk hizmet: ${purchase.addon_code}\nSebep: ${reason}\nİşlem No: ${formatTicketNumber(reference)}\nİşlem sonucu: Ödeme alındı, hak verilmedi`,
      }),
    )
  }
  return flipped ? 'manual_refund_required' : 'already_settled'
}

async function loadSubscription(
  admin: AdminClient,
  subscriptionId: string,
): Promise<AddOnSubscriptionFacts | null> {
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('id, user_id, status, current_period_end, billing_plans!billing_subscriptions_plan_id_fkey(code)')
    .eq('id', subscriptionId)
    .maybeSingle()
  if (error) throw new Error(`addon_subscription_read_failed: ${error.message}`)
  if (!data) return null
  const raw = (data as unknown as { billing_plans: { code: string } | { code: string }[] | null }).billing_plans
  const plan = Array.isArray(raw) ? raw[0] : raw
  return {
    user_id: data.user_id as string,
    status: data.status as string,
    current_period_end: (data.current_period_end as string | null) ?? null,
    planCode: plan?.code,
  }
}

export async function loadCatalogPrice(admin: AdminClient, addonCode: string) {
  const { data, error } = await admin
    .from('billing_plans')
    .select('code, price_cents, currency, interval, product_category, active')
    .eq('code', addonCode)
    .maybeSingle()
  if (error) throw new Error(`addon_catalog_read_failed: ${error.message}`)
  if (!isAddOnCode(addonCode)) return null
  return resolveAddOnPrices(data ? [data as AddOnPlanRow] : [])[addonCode]
}

async function fulfilPaidPurchase(
  admin: AdminClient,
  providerId: PaymentProviderId,
  purchase: PurchaseRow,
  result: PaymentWebhookResult,
): Promise<AddOnSettleOutcome> {
  if (purchase.status === 'granted' || purchase.status === 'manual_refund_required') {
    return 'already_settled'
  }

  // A payment landing on a purchase already failed cannot be matched to the
  // price/period captured earlier: the buyer paid, so a human decides.
  if (purchase.status === 'failed') {
    return rejectForRefund(admin, purchase, 'late_payment', ['failed'], result.reference)
  }

  const facts = verifyAddOnPaymentFacts(purchase, {
    paidAmountCents: result.paidAmountCents,
    paidCurrency: result.paidCurrency,
    orderRef: result.orderRef,
  })
  if (!facts.ok) {
    return rejectForRefund(admin, purchase, facts.reason, ['pending', 'paid'], result.reference)
  }

  // Record the verified payment durably before anything that can fail.
  if (purchase.status === 'pending') {
    const claimed = await transition(admin, purchase.id, ['pending'], 'paid')
    if (!claimed) {
      const { data: current } = await admin
        .from('addon_purchases')
        .select('status')
        .eq('id', purchase.id)
        .maybeSingle()
      if (current?.status !== 'paid') return 'already_settled'
    }
  }

  let subscription: AddOnSubscriptionFacts | null
  let catalogPrice: Awaited<ReturnType<typeof loadCatalogPrice>>
  try {
    subscription = await loadSubscription(admin, purchase.subscription_id)
    catalogPrice = await loadCatalogPrice(admin, purchase.addon_code)
  } catch (err) {
    console.log('[v0] settleAddOnResult: context read failed, leaving purchase paid for retry', {
      purchaseId: purchase.id,
      error: err instanceof Error ? err.message : err,
    })
    return 'retry_pending'
  }
  if (!catalogPrice) {
    return rejectForRefund(admin, purchase, 'unknown_addon', ['paid'], result.reference)
  }

  const context = verifyAddOnFulfillmentContext({ purchase, subscription, catalogPrice })
  if (!context.ok) {
    return rejectForRefund(admin, purchase, context.reason, ['paid'], result.reference)
  }

  // Imported lazily: `effective-limits` is server-only and the settlement
  // module is loaded by every payment path.
  const { grantAddOn } = await import('@/lib/effective-limits')
  const grant = await grantAddOn({
    userId: purchase.user_id,
    addonCode: purchase.addon_code as Parameters<typeof grantAddOn>[0]['addonCode'],
    subscriptionId: purchase.subscription_id,
    idempotencyKey: addOnGrantKey(purchase.id),
    purchaseId: purchase.id,
    source: 'purchase',
  })
  if (!grant.ok) {
    if (grant.error === 'db_error' || grant.error === 'invalid_key') {
      console.log('[v0] settleAddOnResult: grant failed, leaving purchase paid for retry', {
        purchaseId: purchase.id,
        error: grant.error,
      })
      return 'retry_pending'
    }
    return rejectForRefund(admin, purchase, grant.error, ['paid'], result.reference)
  }

  const { error: ledgerError } = await admin.from('billing_transactions').upsert(
    {
      subscription_id: purchase.subscription_id,
      user_id: purchase.user_id,
      kind: 'charge',
      amount_cents: purchase.amount,
      currency: purchase.currency,
      status: 'succeeded',
      provider: providerId,
      provider_ref: result.reference,
      idempotency_key: addOnLedgerKey(purchase.id),
      description: `Ek hizmet: ${purchase.addon_code}`,
    },
    { onConflict: 'user_id,idempotency_key', ignoreDuplicates: false },
  )
  if (ledgerError) {
    console.log('[v0] settleAddOnResult: ledger write failed', { purchaseId: purchase.id, error: ledgerError.message })
  }

  const flipped = await transition(admin, purchase.id, ['paid'], 'granted')
  if (!flipped) return 'already_settled'

  await safeNotify(() =>
    logUserEvent({
      userId: purchase.user_id,
  type: 'payment_succeeded',
  subject: 'Ödeme başarılı — ek hizmet etkinleştirildi',
  includeBillingProfileReminder: true,
      body: `Ek hizmet ödemeniz onaylandı ve hizmetiniz etkinleştirildi. İşlem No: ${formatTicketNumber(result.reference)}.`,
      emailAdmin: false,
    }),
  )
  return 'granted'
}

/**
 * Called by `settlePaymentResult` for every provider-verified result. Returns
 * `null` when the reference is not an add-on purchase so the caller keeps
 * looking; otherwise the outcome of handling it.
 *
 * Lifecycle: pending -> paid -> granted on success, pending -> failed on a failed
 * payment, and -> manual_refund_required whenever the buyer paid but the
 * entitlement must not be given. Re-running is safe: every transition is a
 * conditional update, the entitlement is created only through `grantAddOn` with
 * a per-purchase idempotency key, and `purchase_id` is unique.
 */
export async function settleAddOnResult(
  providerId: PaymentProviderId,
  result: PaymentWebhookResult,
): Promise<AddOnSettleOutcome | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('addon_purchases')
    .select(PURCHASE_COLUMNS)
    .eq('provider_ref', result.reference)
    .maybeSingle()
  if (error) throw new Error(`addon_lookup_failed: ${error.message}`)
  if (!data) return null
  const purchase = data as PurchaseRow

  if (result.status === 'failed') {
    if (purchase.status !== 'pending') return 'ignored'
    await transition(admin, purchase.id, ['pending'], 'failed')
    return 'failed'
  }
  if (result.status !== 'paid') return 'ignored'

  return fulfilPaidPurchase(admin, providerId, purchase, result)
}
