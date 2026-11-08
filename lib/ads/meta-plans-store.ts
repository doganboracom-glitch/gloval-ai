import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import type { MetaPlanContent } from '@/lib/ads/meta-publish-plan'

export const META_CREATIVE_BUCKET = 'ads-meta-creatives'

export type MetaPlanStatus =
  | 'draft' | 'validated' | 'approved' | 'publishing' | 'published' | 'partial' | 'failed' | 'active' | 'user_paused' | 'archived'

export type MetaPlanRow = {
  id: string
  user_id: string
  connection_id: string
  status: MetaPlanStatus
  content: MetaPlanContent
  version: number
  currency: string
  daily_budget_minor: number | null
  request_id: string
  image_sha256: string | null
  plan_hash: string | null
  approved_version: number | null
  approved_at: string | null
  approval_summary: Record<string, unknown> | null
  validated_version: number | null
  validated_at: string | null
  meta_campaign_id: string | null
  meta_adset_id: string | null
  meta_image_hash: string | null
  meta_creative_id: string | null
  meta_ad_id: string | null
  failure_step: string | null
  failure_code: string | null
  failure_reason: string | null
  published_at: string | null
  current_effective_status: string | null
  last_synced_at: string | null
  live_snapshot: Record<string, unknown> | null
  activated_at: string | null
  created_at: string
  updated_at: string
}

const PLAN_SELECT =
  'id,user_id,connection_id,status,content,version,currency,daily_budget_minor,request_id,image_sha256,plan_hash,approved_version,approved_at,approval_summary,validated_version,validated_at,meta_campaign_id,meta_adset_id,meta_image_hash,meta_creative_id,meta_ad_id,failure_step,failure_code,failure_reason,published_at,current_effective_status,last_synced_at,live_snapshot,activated_at,created_at,updated_at'

type Admin = ReturnType<typeof createAdminClient>

export function metaPlanView(row: MetaPlanRow) {
  return {
    id: row.id,
    connectionId: row.connection_id,
    status: row.status,
    version: row.version,
    content: row.content,
    hasStoredImage: Boolean(row.content.imagePath && row.image_sha256),
    currency: row.currency,
    dailyBudgetMinor: row.daily_budget_minor,
    approvedVersion: row.approved_version,
    validatedVersion: row.validated_version,
    objects: {
      campaignId: row.meta_campaign_id,
      adSetId: row.meta_adset_id,
      imageHash: row.meta_image_hash,
      creativeId: row.meta_creative_id,
      adId: row.meta_ad_id,
    },
    failureStep: row.failure_step,
    failureCode: row.failure_code,
    failureReason: row.failure_reason,
    publishedAt: row.published_at,
    effectiveStatus: row.current_effective_status,
    lastSyncedAt: row.last_synced_at,
    live: row.live_snapshot,
    activatedAt: row.activated_at,
    updatedAt: row.updated_at,
  }
}

export async function getMetaPlan(admin: Admin, userId: string, planId: string): Promise<MetaPlanRow | null> {
  const { data, error } = await admin.from('ads_meta_plans').select(PLAN_SELECT).eq('id', planId).eq('user_id', userId).is('deleted_at', null).maybeSingle()
  if (error) throw new MetaAdsError('provider_error')
  return (data as MetaPlanRow | null) ?? null
}

export async function listMetaPlans(admin: Admin, userId: string, connectionId: string): Promise<MetaPlanRow[]> {
  const { data, error } = await admin
    .from('ads_meta_plans')
    .select(PLAN_SELECT)
    .eq('user_id', userId)
    .eq('connection_id', connectionId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(20)
  if (error) throw new MetaAdsError('provider_error')
  return (data as MetaPlanRow[] | null) ?? []
}

export async function softDeleteMetaPlan(admin: Admin, input: {
  userId: string
  planId: string
  metaStatuses: import('@/lib/ads/meta-plan-deletion').MetaPlanDeletionStatuses | null
}): Promise<void> {
  const { data, error } = await admin.rpc('ads_soft_delete_meta_plan', {
    p_user_id: input.userId,
    p_plan_id: input.planId,
    p_meta_statuses: input.metaStatuses,
  })
  if (error) throw new MetaAdsError('provider_error')
  const result = (Array.isArray(data) ? data[0] : data) as { state?: string } | null
  switch (result?.state) {
    case 'deleted':
      return
    case 'active':
      throw new MetaAdsError('meta_plan_active')
    case 'plan_busy':
      throw new MetaAdsError('meta_plan_busy')
    case 'meta_confirmation_required':
      throw new MetaAdsError('meta_confirmation_required')
    case 'invalid_request':
      throw new MetaAdsError('invalid_request')
    case 'not_found':
    default:
      throw new MetaAdsError('plan_not_found')
  }
}

export async function createMetaPlan(admin: Admin, input: {
  userId: string
  connectionId: string
  content: MetaPlanContent
  currency: string
  dailyBudgetMinor: number
}): Promise<MetaPlanRow> {
  const { data, error } = await admin
    .from('ads_meta_plans')
    .insert({
      user_id: input.userId,
      connection_id: input.connectionId,
      content: input.content,
      currency: input.currency,
      daily_budget_minor: input.dailyBudgetMinor,
    })
    .select(PLAN_SELECT)
    .single()
  if (error || !data) throw new MetaAdsError('provider_error')
  return data as MetaPlanRow
}

/** Any content edit bumps the version and invalidates validation and approval (re-approval is required). */
export async function updateMetaPlanContent(admin: Admin, plan: MetaPlanRow, input: {
  content: MetaPlanContent
  dailyBudgetMinor: number
}): Promise<MetaPlanRow> {
  if (!['draft', 'validated', 'approved', 'failed', 'partial'].includes(plan.status)) throw new MetaAdsError('plan_changed')
  const { data, error } = await admin
    .from('ads_meta_plans')
    .update({
      content: input.content,
      daily_budget_minor: input.dailyBudgetMinor,
      version: plan.version + 1,
      status: plan.status === 'partial' ? 'partial' : 'draft',
      plan_hash: null,
      approved_version: null,
      approved_at: null,
      approval_summary: null,
      validated_version: null,
      validated_at: null,
    })
    .eq('id', plan.id)
    .eq('user_id', plan.user_id)
    .is('deleted_at', null)
    .eq('version', plan.version)
    .select(PLAN_SELECT)
    .maybeSingle()
  if (error) throw new MetaAdsError('provider_error')
  if (!data) throw new MetaAdsError('plan_changed')
  return data as MetaPlanRow
}

export async function markMetaPlanValidated(admin: Admin, plan: MetaPlanRow): Promise<void> {
  const { error } = await admin
    .from('ads_meta_plans')
    .update({ status: plan.status === 'partial' ? 'partial' : 'validated', validated_version: plan.version, validated_at: new Date().toISOString() })
    .eq('id', plan.id)
    .eq('user_id', plan.user_id)
    .is('deleted_at', null)
    .eq('version', plan.version)
  if (error) throw new MetaAdsError('provider_error')
}

export async function setMetaPlanImage(admin: Admin, plan: MetaPlanRow, imagePath: string, sha256: string, imageFilename: string): Promise<MetaPlanRow> {
  return updateMetaPlanContentAndImage(admin, plan, { ...plan.content, imagePath, imageFilename }, sha256)
}

async function updateMetaPlanContentAndImage(admin: Admin, plan: MetaPlanRow, content: MetaPlanContent, sha256: string) {
  const { data, error } = await admin
    .from('ads_meta_plans')
    .update({
      content,
      image_sha256: sha256,
      version: plan.version + 1,
      status: plan.status === 'partial' ? 'partial' : 'draft',
      plan_hash: null,
      approved_version: null,
      approved_at: null,
      approval_summary: null,
      validated_version: null,
      validated_at: null,
    })
    .eq('id', plan.id)
    .eq('user_id', plan.user_id)
    .is('deleted_at', null)
    .eq('version', plan.version)
    .select(PLAN_SELECT)
    .maybeSingle()
  if (error) throw new MetaAdsError('provider_error')
  if (!data) throw new MetaAdsError('plan_changed')
  return data as MetaPlanRow
}

export async function saveMetaPlanObject(admin: Admin, plan: MetaPlanRow, column: 'meta_campaign_id' | 'meta_adset_id' | 'meta_image_hash' | 'meta_creative_id' | 'meta_ad_id', value: string) {
  const { error } = await admin.from('ads_meta_plans').update({ [column]: value }).eq('id', plan.id).eq('user_id', plan.user_id).is('deleted_at', null)
  if (error) throw new MetaAdsError('provider_error')
}

export async function appendMetaAction(admin: Admin, input: {
  userId: string
  planId: string
  connectionId: string
  actor: 'user' | 'ai' | 'system'
  actionType: string
  target?: Record<string, unknown>
  afterState?: Record<string, unknown>
  status: 'proposed' | 'approved' | 'applied' | 'failed'
}) {
  const { error } = await admin.from('ads_meta_actions').insert({
    user_id: input.userId,
    plan_id: input.planId,
    connection_id: input.connectionId,
    actor: input.actor,
    action_type: input.actionType,
    target: input.target ?? null,
    after_state: input.afterState ?? null,
    status: input.status,
    applied_at: input.status === 'proposed' ? null : new Date().toISOString(),
  })
  if (error) console.error('[meta-ads] audit row failed')
}

export async function ensureMetaCreativeBucket(admin: Admin) {
  const { error } = await admin.storage.createBucket(META_CREATIVE_BUCKET, { public: false, fileSizeLimit: 5 * 1024 * 1024 })
  if (error && !/already exists|duplicate/i.test(error.message)) throw new MetaAdsError('provider_error')
}
