import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  ADS_CREDIT_COSTS,
  adsChargeReason,
  type AdsCreditAction,
} from '@/lib/ads/credit-costs'
import type { GoogleAdsApprovalSummary } from '@/lib/ads/google-ads-publish-plan'

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

export type AdsPublishBeginResult =
  | { ok: true; balance: number; alreadyCharged: boolean; chargedAmount: number }
  | {
      ok: false
      reason:
        | 'insufficient_credits'
        | 'publish_in_progress'
        | 'plan_not_approved'
        | 'plan_not_found'
        | 'plan_changed'
        | 'currency_mismatch'
        | 'reservation_failed'
      balance: number
    }

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

/** Atomically charges 15 publish credits and claims the approved plan for one create attempt. */
export async function beginAdsPublish(
  userId: string,
  planId: string,
  requestId: string,
  expectedVersion: number,
  approvalSummary: GoogleAdsApprovalSummary,
  client: AdsRpcClient = defaultClient(),
): Promise<AdsPublishBeginResult> {
  adsChargeReason('publish', requestId)
  const { data, error } = await client
    .rpc('ads_begin_google_ads_publish', {
      p_user_id: userId,
      p_plan_id: planId,
      p_request_id: requestId,
      p_expected_version: expectedVersion,
      p_cpc_bid_ceiling_minor: approvalSummary.cpcBidCeilingMinor,
      p_cpc_bid_ceiling_micros: approvalSummary.cpcBidCeilingMicros,
      p_currency_fraction_digits: approvalSummary.currencyFractionDigits,
    })
    .maybeSingle()

  if (error || !data) {
    console.error('[ads-credits] publish reservation failed:', error?.message ?? 'no row')
    return { ok: false, reason: 'reservation_failed', balance: 0 }
  }

  const row = data as {
    state: string
    balance: number
    already_charged: boolean
    charged_amount: number
  }
  const balance = row.balance ?? 0
  if (row.state === 'started') {
    return {
      ok: true,
      balance,
      alreadyCharged: Boolean(row.already_charged),
      chargedAmount: row.charged_amount ?? ADS_CREDIT_COSTS.publish,
    }
  }
  if (row.state === 'insufficient_credits') return { ok: false, reason: 'insufficient_credits', balance }
  if (row.state === 'in_progress' || row.state === 'already_published') {
    return { ok: false, reason: 'publish_in_progress', balance }
  }
  if (row.state === 'not_found') return { ok: false, reason: 'plan_not_found', balance }
  if (row.state === 'plan_changed') return { ok: false, reason: 'plan_changed', balance }
  if (row.state === 'currency_mismatch') return { ok: false, reason: 'currency_mismatch', balance }
  return { ok: false, reason: 'plan_not_approved', balance }
}

/**
 * Refunds exactly what `chargeAdsCredits` took for this request, once. Safe to
 * call on every failure path: a repeat or a refund without a charge changes
 * nothing.
 */
export async function beginAdsGooglePublishE2(
  input: {
    userId: string
    planId: string
    requestId: string
    expectedVersion: number
    approvalId: string
    approvalHash: string
    approvalSummary: GoogleAdsApprovalSummary
  },
  client: AdsRpcClient = defaultClient(),
): Promise<AdsPublishBeginResult> {
  adsChargeReason('publish', input.requestId)
  const { data, error } = await client.rpc('ads_begin_google_ads_publish_v2', {
    p_user_id: input.userId,
    p_plan_id: input.planId,
    p_request_id: input.requestId,
    p_expected_version: input.expectedVersion,
    p_approval_id: input.approvalId,
    p_plan_hash: input.approvalHash,
    p_cpc_bid_ceiling_minor: input.approvalSummary.cpcBidCeilingMinor,
    p_cpc_bid_ceiling_micros: input.approvalSummary.cpcBidCeilingMicros,
    p_currency_fraction_digits: input.approvalSummary.currencyFractionDigits,
  }).maybeSingle()
  if (error || !data) return { ok: false, reason: 'reservation_failed', balance: 0 }

  const row = data as { state: string; balance: number; already_charged?: boolean; charged_amount?: number }
  const balance = row.balance ?? 0
  if (row.state === 'started') {
    return { ok: true, balance, alreadyCharged: Boolean(row.already_charged), chargedAmount: row.charged_amount ?? 0 }
  }
  if (row.state === 'insufficient_credits') return { ok: false, reason: 'insufficient_credits', balance }
  if (row.state === 'publish_in_progress' || row.state === 'already_published') {
    return { ok: false, reason: 'publish_in_progress', balance }
  }
  if (row.state === 'plan_changed') return { ok: false, reason: 'plan_changed', balance }
  if (row.state === 'currency_mismatch') return { ok: false, reason: 'currency_mismatch', balance }
  if (row.state === 'not_found') return { ok: false, reason: 'plan_not_found', balance }
  return { ok: false, reason: 'plan_not_approved', balance }
}

export type AdsGooglePublishFinalizeResult =
  | { ok: true; balance: number; alreadyCharged: boolean; chargedAmount: number }
  | { ok: false; reason: 'insufficient_credits' | 'finalize_failed'; balance: number }

export async function finalizeAdsGooglePublishE2(
  input: { userId: string; planId: string; requestId: string; externalCampaignId: string; billingVerified: boolean },
  client: AdsRpcClient = defaultClient(),
): Promise<AdsGooglePublishFinalizeResult> {
  const { data, error } = await client.rpc('ads_finalize_google_ads_publish_e2', {
    p_user_id: input.userId,
    p_plan_id: input.planId,
    p_request_id: input.requestId,
    p_external_campaign_id: input.externalCampaignId,
    p_billing_verified: input.billingVerified,
  }).maybeSingle()
  if (error || !data) return { ok: false, reason: 'finalize_failed', balance: 0 }
  const row = data as { state: string; balance: number; already_charged?: boolean; charged_amount?: number }
  if (row.state !== 'published') {
    return { ok: false, reason: row.state === 'insufficient_credits' ? 'insufficient_credits' : 'finalize_failed', balance: row.balance ?? 0 }
  }
  return {
    ok: true,
    balance: row.balance ?? 0,
    alreadyCharged: Boolean(row.already_charged),
    chargedAmount: row.charged_amount ?? 0,
  }
}

export async function releaseAdsGooglePublishE2(
  input: { userId: string; planId: string; requestId: string; reason: string },
  client: AdsRpcClient = defaultClient(),
): Promise<boolean> {
  const { data, error } = await client.rpc('ads_release_google_ads_publish_e2', {
    p_user_id: input.userId,
    p_plan_id: input.planId,
    p_request_id: input.requestId,
    p_failure_reason: input.reason,
  }).maybeSingle()
  if (error || !data) return false
  const row = data as { released?: boolean }
  return row.released === true
}

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
