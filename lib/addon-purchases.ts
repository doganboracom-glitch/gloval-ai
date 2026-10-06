import type { AddOnCode } from '@/lib/add-ons'

/** `addon_purchases.status` check constraint, in lifecycle order. */
export const ADDON_PURCHASE_STATUSES = [
  'pending',
  'paid',
  'granted',
  'failed',
  'manual_refund_required',
] as const

export type AddOnPurchaseStatus = (typeof ADDON_PURCHASE_STATUSES)[number]

/** PSP basket/order reference for a purchase: `addon_<purchase_id>`. */
export const ADDON_ORDER_PREFIX = 'addon_'

export function addOnOrderRef(purchaseId: string): string {
  return `${ADDON_ORDER_PREFIX}${purchaseId}`
}

/** `user_addon_entitlements.idempotency_key` for the grant a purchase produces. */
export function addOnGrantKey(purchaseId: string): string {
  return `addon_purchase_${purchaseId}`
}

/** `billing_transactions.idempotency_key` for the charge a purchase produces. */
export function addOnLedgerKey(purchaseId: string): string {
  return `addon_${purchaseId}`
}

export function isAddOnPurchaseStatus(value: unknown): value is AddOnPurchaseStatus {
  return typeof value === 'string' && (ADDON_PURCHASE_STATUSES as readonly string[]).includes(value)
}

/** Raw `public.addon_purchases` row as returned by Supabase. */
export type AddOnPurchaseRow = {
  id: string
  user_id: string
  subscription_id: string
  addon_code: string
  /** Catalog price snapshot in minor units (kurus), never a client value. */
  amount: number
  currency: string
  /** Subscription `current_period_end` at purchase time. */
  period_end_snapshot: string
  status: string
  provider: string
  provider_ref: string | null
  created_at: string
  updated_at: string
}

export type AddOnPurchase = {
  id: string
  userId: string
  subscriptionId: string
  addonCode: AddOnCode
  amountCents: number
  currency: string
  periodEndSnapshot: string
  status: AddOnPurchaseStatus
  provider: string
  providerRef: string | null
  createdAt: string
  updatedAt: string
}

/** Insert payload; the server fills price and period from the catalog and the live subscription. */
export type NewAddOnPurchase = Pick<
  AddOnPurchaseRow,
  'user_id' | 'subscription_id' | 'addon_code' | 'amount' | 'currency' | 'period_end_snapshot' | 'provider'
> & { status?: AddOnPurchaseStatus; provider_ref?: string | null }

/** `user_addon_entitlements.purchase_id` link: one purchase yields at most one grant. */
export type AddOnEntitlementPurchaseLink = { purchase_id: string | null }

/**
 * Maps a DB row to the app model. Returns null for rows whose status or add-on
 * code is not recognised, so callers never act on a state they do not understand.
 */
export function toAddOnPurchase(
  row: AddOnPurchaseRow,
  isKnownAddOnCode: (code: string) => code is AddOnCode,
): AddOnPurchase | null {
  if (!isAddOnPurchaseStatus(row.status) || !isKnownAddOnCode(row.addon_code)) return null
  return {
    id: row.id,
    userId: row.user_id,
    subscriptionId: row.subscription_id,
    addonCode: row.addon_code,
    amountCents: row.amount,
    currency: row.currency,
    periodEndSnapshot: row.period_end_snapshot,
    status: row.status,
    provider: row.provider,
    providerRef: row.provider_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
