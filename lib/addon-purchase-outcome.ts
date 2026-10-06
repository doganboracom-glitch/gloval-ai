import { ADD_ONS, isAddOnCode, type AddOnCode, type AddOnKind } from '@/lib/add-ons'
import type { PurchaseAddOnError } from '@/lib/addon-purchase-actions'

/**
 * What the buyer is told after returning from the payment page. The state is
 * ALWAYS derived from the stored `addon_purchases.status` (written only by the
 * verified callback settlement), never from the browser message or the URL.
 */
export type AddOnOutcomeState = 'success' | 'failed' | 'pending' | 'processing' | 'review'

export type AddOnPurchaseOutcome = {
  state: AddOnOutcomeState
  addonCode: AddOnCode
  kind: AddOnKind
  capacity: number
  /** End of the validity window for a granted add-on; null otherwise. */
  validUntil: string | null
}

/** Only a recent purchase is a meaningful "result of the payment I just made". */
export const OUTCOME_WINDOW_MS = 2 * 60 * 60 * 1000

export function outcomeStateForStatus(status: string): AddOnOutcomeState | null {
  switch (status) {
    case 'granted':
      return 'success'
    case 'failed':
      return 'failed'
    case 'pending':
      return 'pending'
    case 'paid':
      return 'processing'
    case 'manual_refund_required':
      return 'review'
    default:
      return null
  }
}

export function buildPurchaseOutcome(input: {
  status: string
  addonCode: string
  updatedAt: string
  validUntil?: string | null
  now?: number
}): AddOnPurchaseOutcome | null {
  const state = outcomeStateForStatus(input.status)
  if (!state || !isAddOnCode(input.addonCode)) return null
  const updated = Date.parse(input.updatedAt)
  const now = input.now ?? Date.now()
  if (!Number.isFinite(updated) || now - updated > OUTCOME_WINDOW_MS) return null
  const def = ADD_ONS[input.addonCode]
  return {
    state,
    addonCode: def.code,
    kind: def.kind,
    capacity: def.capacity,
    validUntil: state === 'success' ? (input.validUntil ?? null) : null,
  }
}

export type PurchaseErrorCopy = {
  unauthenticated: string
  noSubscription: string
  subscriptionInactive: string
  invalidAddon: string
  notAvailable: string
  notEligible: string
  purchaseInProgress: string
  paymentInitFailed: string
  generic: string
}

export function purchaseErrorMessage(error: PurchaseAddOnError, copy: PurchaseErrorCopy): string {
  switch (error) {
    case 'unauthenticated':
      return copy.unauthenticated
    case 'no_subscription':
      return copy.noSubscription
    case 'subscription_inactive':
      return copy.subscriptionInactive
    case 'invalid_addon':
      return copy.invalidAddon
    case 'not_available':
      return copy.notAvailable
    case 'not_eligible':
      return copy.notEligible
    case 'purchase_in_progress':
      return copy.purchaseInProgress
    case 'payment_init_failed':
      return copy.paymentInitFailed
    default:
      return copy.generic
  }
}

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))
}
