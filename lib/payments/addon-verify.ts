import { isAddOnCode, isAddOnEligible, ADD_ONS, type AddOnPrice } from '@/lib/add-ons'
import { toPlanCode } from '@/lib/pricing-config'
import { addOnOrderRef } from '@/lib/addon-purchases'

/** Facts the provider-verified payment result carries (iyzico retrieve echoes all three). */
export type AddOnPaymentFacts = {
  paidAmountCents?: number
  paidCurrency?: string
  orderRef?: string
}

export type AddOnRejectReason =
  | 'unverified_payment'
  | 'amount_mismatch'
  | 'currency_mismatch'
  | 'order_mismatch'
  | 'late_payment'
  | 'unknown_addon'
  | 'catalog_mismatch'
  | 'subscription_not_found'
  | 'user_mismatch'
  | 'subscription_inactive'
  | 'not_eligible'

export type AddOnVerdict = { ok: true } | { ok: false; reason: AddOnRejectReason }

export function normalizeCurrency(currency: string): string {
  return currency.toUpperCase().replace('TL', 'TRY')
}

/**
 * Checks the verified provider result against the purchase snapshot the server
 * wrote before the buyer was sent to the PSP. Unlike the other flows, every
 * fact is REQUIRED: this path releases a paid entitlement, so a result that
 * cannot prove amount, currency and basket id is never fulfilled.
 */
export function verifyAddOnPaymentFacts(
  purchase: { id: string; amount: number; currency: string },
  facts: AddOnPaymentFacts,
): AddOnVerdict {
  if (
    facts.paidAmountCents === undefined ||
    facts.paidCurrency === undefined ||
    facts.orderRef === undefined
  ) {
    return { ok: false, reason: 'unverified_payment' }
  }
  if (facts.orderRef !== addOnOrderRef(purchase.id)) return { ok: false, reason: 'order_mismatch' }
  if (facts.paidAmountCents !== purchase.amount) return { ok: false, reason: 'amount_mismatch' }
  if (normalizeCurrency(facts.paidCurrency) !== purchase.currency.toUpperCase()) {
    return { ok: false, reason: 'currency_mismatch' }
  }
  return { ok: true }
}

export type AddOnSubscriptionFacts = {
  user_id: string
  status: string
  current_period_end: string | null
  planCode: string | null | undefined
}

/**
 * Checks the purchase against the live catalog and the live subscription at
 * the moment the payment is processed. Entitlement creation itself stays in
 * `grantAddOn`; this only decides whether it may be attempted.
 */
export function verifyAddOnFulfillmentContext(input: {
  purchase: { user_id: string; addon_code: string; amount: number; currency: string }
  subscription: AddOnSubscriptionFacts | null
  catalogPrice: AddOnPrice
  now?: Date
}): AddOnVerdict {
  const { purchase, subscription, catalogPrice } = input
  if (!isAddOnCode(purchase.addon_code)) return { ok: false, reason: 'unknown_addon' }
  if (
    purchase.amount !== catalogPrice.priceCents ||
    purchase.currency.toUpperCase() !== catalogPrice.currency.toUpperCase()
  ) {
    return { ok: false, reason: 'catalog_mismatch' }
  }
  if (!subscription) return { ok: false, reason: 'subscription_not_found' }
  if (subscription.user_id !== purchase.user_id) return { ok: false, reason: 'user_mismatch' }
  const now = input.now ?? new Date()
  if (
    subscription.status !== 'active' ||
    !subscription.current_period_end ||
    new Date(subscription.current_period_end) <= now
  ) {
    return { ok: false, reason: 'subscription_inactive' }
  }
  if (!isAddOnEligible(ADD_ONS[purchase.addon_code].kind, toPlanCode(subscription.planCode))) {
    return { ok: false, reason: 'not_eligible' }
  }
  return { ok: true }
}
