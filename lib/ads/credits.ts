import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  ADS_CREDIT_COSTS,
  adsChargeReason,
  type AdsCreditAction,
} from '@/lib/ads/credit-costs'

/**
 * The ONLY code path that writes ads rows to the credit ledger. It calls the
 * `ads_charge_credits` / `ads_refund_credits` RPCs and nothing else: ads code
 * must never call `consumeCredits` / `refundCredits` (see
 * `lib/ads/credit-isolation.test.ts`).
 */

/** The slice of a Supabase client these helpers need; lets tests inject a fake. */
export type AdsRpcClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): {
    maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>
  }
}

export type AdsChargeResult =
  | { ok: true; balance: number; alreadyCharged: boolean; chargedAmount: number; reason: string }
  | { ok: false; reason: 'insufficient_credits'; balance: number }
  | { ok: false; reason: 'charge_failed'; balance: 0 }

export type AdsRefundResult = { refunded: boolean; balance: number; refundedAmount: number }

function defaultClient(): AdsRpcClient {
  return createAdminClient() as unknown as AdsRpcClient
}

/**
 * Charges `action` once per (user, request id). A retry with the same request
 * id returns `alreadyCharged: true` and takes nothing more. Fails closed on any
 * RPC error.
 */
export async function chargeAdsCredits(
  userId: string,
  action: AdsCreditAction,
  requestId: string,
  client: AdsRpcClient = defaultClient(),
): Promise<AdsChargeResult> {
  const reason = adsChargeReason(action, requestId)
  const { data, error } = await client
    .rpc('ads_charge_credits', {
      p_user_id: userId,
      p_amount: ADS_CREDIT_COSTS[action],
      p_reason: reason,
    })
    .maybeSingle()

  if (error || !data) {
    console.error('[ads-credits] charge failed:', error?.message ?? 'no row')
    return { ok: false, reason: 'charge_failed', balance: 0 }
  }
  const row = data as {
    ok: boolean
    balance: number
    already_charged: boolean
    charged_amount: number
  }
  if (!row.ok) return { ok: false, reason: 'insufficient_credits', balance: row.balance ?? 0 }
  return {
    ok: true,
    balance: row.balance ?? 0,
    alreadyCharged: Boolean(row.already_charged),
    chargedAmount: row.charged_amount ?? 0,
    reason,
  }
}

/**
 * Refunds exactly what `chargeAdsCredits` took for this request, once. Safe to
 * call on every failure path: a repeat or a refund without a charge changes
 * nothing.
 */
export async function refundAdsCredits(
  userId: string,
  action: AdsCreditAction,
  requestId: string,
  client: AdsRpcClient = defaultClient(),
): Promise<AdsRefundResult> {
  const { data, error } = await client
    .rpc('ads_refund_credits', {
      p_user_id: userId,
      p_charge_reason: adsChargeReason(action, requestId),
    })
    .maybeSingle()

  if (error || !data) {
    console.error('[ads-credits] refund failed:', error?.message ?? 'no row')
    return { refunded: false, balance: 0, refundedAmount: 0 }
  }
  const row = data as { refunded: boolean; balance: number; refunded_amount: number }
  return {
    refunded: Boolean(row.refunded),
    balance: row.balance ?? 0,
    refundedAmount: row.refunded_amount ?? 0,
  }
}
