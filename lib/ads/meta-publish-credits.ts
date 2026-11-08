/**
 * Meta publish credit rule (same as Google Ads): 15 AI credits are held when a publish attempt starts and are
 * charged only once the plan is fully published. All money logic lives in SQL (scripts/131); this module only
 * maps RPC results to route behaviour. Server-side use only (receives the service-role client).
 */
import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import type { MetaPublishObjects } from '@/lib/ads/meta-publish'
import type { MetaCreditInfo, MetaCreditState } from '@/lib/ads/meta-publish-ux'
import { META_PUBLISH_CREDIT_COST } from '@/lib/ads/meta-publish-ux'

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> & {
    maybeSingle?: () => PromiseLike<{ data: unknown; error: unknown }>
  }
}

const CREDIT_STATES: readonly MetaCreditState[] = ['charged', 'already_charged', 'charge_pending', 'released', 'no_reservation', 'none']

function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : null
}

function toInt(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

export function asMetaCreditState(value: unknown): MetaCreditState {
  return CREDIT_STATES.includes(value as MetaCreditState) ? (value as MetaCreditState) : 'none'
}

/** Reads balance, open holds and spendable credits. Returns null when the read fails (UI then hides the figure). */
export async function getMetaPublishCreditInfo(admin: RpcClient, userId: string): Promise<MetaCreditInfo | null> {
  const { data, error } = await admin.rpc('ads_meta_publish_credit_balance', { p_user_id: userId })
  const row = firstRow(data)
  if (error || !row) return null
  return { balance: toInt(row.balance), reserved: toInt(row.reserved), available: toInt(row.available), cost: META_PUBLISH_CREDIT_COST }
}

export type MetaPublishReservation = { actionId: string; balanceAfterHold: number }

/**
 * Atomically checks plan readiness, credits and daily capacity, then holds 15 credits.
 * Throws a MetaAdsError (insufficient_credits, publish_quota_exceeded, ...) when nothing was reserved: in every
 * such case no Meta object has been created and nothing has been charged.
 */
export async function reserveMetaPublish(admin: RpcClient, input: {
  userId: string
  planId: string
  connectionId: string
  requestId: string
  perUserLimit: number
  globalLimit: number | null
}): Promise<MetaPublishReservation> {
  const { data, error } = await admin.rpc('ads_reserve_meta_publish_credits', {
    p_user_id: input.userId,
    p_plan_id: input.planId,
    p_connection_id: input.connectionId,
    p_request_id: input.requestId,
    p_daily_attempts_per_user: input.perUserLimit,
    p_daily_attempts_global: input.globalLimit,
  })
  const row = firstRow(data)
  if (error || !row) throw new MetaAdsError('provider_error')
  const state = typeof row.state === 'string' ? row.state : ''
  const actionId = typeof row.action_id === 'string' ? row.action_id : null
  if (state === 'reserved' && actionId) return { actionId, balanceAfterHold: toInt(row.balance) }
  switch (state) {
    case 'insufficient_credits':
      throw new MetaAdsError('insufficient_credits')
    case 'user_publish_limit_reached':
    case 'global_publish_limit_reached':
      throw new MetaAdsError('publish_quota_exceeded')
    case 'publish_in_progress':
      throw new MetaAdsError('publish_in_progress')
    case 'plan_not_ready':
      throw new MetaAdsError('plan_not_approved')
    default:
      throw new MetaAdsError('invalid_request')
  }
}

export type MetaPublishFinish = {
  outcome: 'published' | 'partial' | 'failed'
  objects: MetaPublishObjects
  failure?: { step: string; code: string; reason: string }
}

/**
 * Stores the outcome and settles the hold in one transaction: charge on 'published', release otherwise.
 * A failed charge never undoes the publish (creditState 'charge_pending').
 */
export async function finishMetaPublish(admin: RpcClient, input: {
  userId: string
  planId: string
  actionId: string
} & MetaPublishFinish): Promise<{ creditState: MetaCreditState; balance: number | null; ok: boolean }> {
  const { data, error } = await admin.rpc('ads_finish_meta_publish_v2', {
    p_user_id: input.userId,
    p_plan_id: input.planId,
    p_action_id: input.actionId,
    p_outcome: input.outcome,
    p_campaign_id: input.objects.campaignId,
    p_adset_id: input.objects.adSetId,
    p_image_hash: input.objects.imageHash,
    p_creative_id: input.objects.creativeId,
    p_ad_id: input.objects.adId,
    p_failure_step: input.failure?.step ?? null,
    p_failure_code: input.failure?.code ?? null,
    p_failure_reason: input.failure?.reason ?? null,
  })
  const row = firstRow(data)
  if (error || !row) {
    console.error('[meta-ads] finish publish failed')
    return { creditState: 'none', balance: null, ok: false }
  }
  return { creditState: asMetaCreditState(row.credit_state), balance: toInt(row.balance), ok: true }
}

/** Retries the charge of a plan that is already published (idempotent; at most one charge per plan). */
export async function settleMetaPublishCredit(admin: RpcClient, userId: string, planId: string): Promise<MetaCreditState> {
  const { data, error } = await admin.rpc('ads_settle_meta_publish_credit', { p_user_id: userId, p_plan_id: planId })
  const row = firstRow(data)
  if (error || !row) return 'none'
  switch (row.state) {
    case 'charged': return 'charged'
    case 'already_charged': return 'already_charged'
    case 'insufficient_credits': return 'charge_pending'
    default: return 'none'
  }
}
