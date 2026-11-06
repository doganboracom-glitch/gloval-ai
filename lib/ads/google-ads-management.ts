import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { AdsRpcClient } from '@/lib/ads/credits'
import { resolveGoogleAdsPublishAccess } from '@/lib/ads/env'
import { evaluateCopyPolicy } from '@/lib/ads/policy'
import { isCleanText } from '@/lib/ads/planner'
import { createGoogleAdsActionApprovalHash, hashGoogleAdsApprovalPayload } from '@/lib/ads/google-ads-approval'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import { buildGoogleAdsApprovalSummary, googleAdsMicrosFromMinorUnits } from '@/lib/ads/google-ads-publish-plan'
import { evaluateGoogleAdsAmountRisk, googleAdsMonthlyBudgetUpperBoundMinor, googleAdsRiskConfirmationError } from '@/lib/ads/google-ads-risk'
import { logUserEvent } from '@/lib/notify'
import { withGoogleAdsPublishAccess, type GoogleAdsAccess } from '@/lib/ads/google-ads-publish'
import type { GoogleAdsCampaignManagementState } from '@/lib/ads/providers/types'

const MANAGEMENT_ACTION_TYPES = [
  'google_ads_campaign_status_update',
  'google_ads_budget_update',
  'google_ads_ad_copy_update',
  'google_ads_keyword_update',
  'google_ads_campaign_archive',
] as const

type ManagementActionType = typeof MANAGEMENT_ACTION_TYPES[number]
type UserAction = 'pause' | 'enable' | 'budget' | 'ad_copy' | 'keyword' | 'archive'
type SnapshotState = Pick<
  GoogleAdsCampaignManagementState,
  'campaignId' | 'campaignStatus' | 'dailyBudgetMicros' | 'headlines' | 'descriptions'
> & { keywords: NonNullable<GoogleAdsCampaignManagementState['keywords']> }

type ManagementPerformance = {
  range: 'last_7_days'
  impressions: number
  clicks: number
  conversions: number
  costMicros: string
  ctr: number
}

type ManagementPlan = {
  id: string
  user_id: string
  connection_id: string | null
  status: string
  version: number
  approved_version: number | null
  currency: string
  daily_budget_minor: number | null
  google_daily_budget_minor: number | null
  external_campaign_id: string | null
  plan: Record<string, unknown>
}

export type GoogleAdsManagementSnapshot = SnapshotState & {
  stateHash: string
  reviewStatus: 'approved' | 'disapproved' | 'review_in_progress' | 'unavailable'
  billingVerified: boolean
  paymentMethodWarning: boolean
  performance: ManagementPerformance | null
  recommendedDailyBudgetMinor: number | null
  recommendationSource: 'ai' | 'saved' | 'unavailable'
  averageDailySpend30dMinor: number | null
}

export type GoogleAdsManagementAction = {
  id: string
  action_type: ManagementActionType
  target: Record<string, unknown>
  before_state: SnapshotState | null
  after_state: SnapshotState | null
  reversible: boolean
  status: 'proposed' | 'approved' | 'applied' | 'failed' | 'undone'
  undone_of: string | null
  failure_reason: string | null
  created_at: string
  applied_at: string | null
}

type ActionInput = {
  userId: string
  planId: string
  actionId: string
  expectedVersion: number
  expectedStateHash: string
  action: UserAction | 'undo'
  dailyBudgetMinor?: number
  headlines?: string[]
  descriptions?: string[]
  keywordOperation?: 'add' | 'remove'
  keywordText?: string
  keywordMatchType?: 'EXACT' | 'PHRASE'
  keywordNegative?: boolean
  keywordResourceName?: string
  undoActionId?: string
  acknowledgedBillingWarning?: boolean
  riskAcknowledged?: boolean
  riskConfirmedAmountMinor?: number
  userConfirmed: boolean
}

type RawAction = {
  id: string
  action_type: ManagementActionType
  target: Record<string, unknown>
  before_state: SnapshotState | null
  after_state: SnapshotState | null
  reversible: boolean
  status: GoogleAdsManagementAction['status']
  undone_of: string | null
  failure_reason: string | null
  created_at: string
  applied_at: string | null
}

type PreparedAction = {
  action: UserAction
  actionType: ManagementActionType
  target: Record<string, unknown>
  undoOf: string | null
}

function snapshotState(state: GoogleAdsCampaignManagementState): SnapshotState {
  return {
    campaignId: state.campaignId,
    campaignStatus: state.campaignStatus,
    dailyBudgetMicros: state.dailyBudgetMicros,
    headlines: state.headlines,
    descriptions: state.descriptions,
    keywords: state.keywords ?? [],
  }
}

function snapshotHash(state: SnapshotState) {
  return hashGoogleAdsApprovalPayload(state)
}

function stateMatches(left: SnapshotState, right: SnapshotState) {
  return snapshotHash(left) === snapshotHash(right)
}

async function loadManagementPlan(userId: string, planId: string): Promise<ManagementPlan> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ads_plans')
    .select('id,user_id,connection_id,status,version,approved_version,currency,daily_budget_minor,google_daily_budget_minor,external_campaign_id,plan')
    .eq('id', planId)
    .eq('user_id', userId)
    .eq('platform', 'google_ads')
    .maybeSingle()
  if (error) throw new GoogleAdsError('provider_error')
  if (!data) throw new GoogleAdsError('plan_not_found')
  if (data.status !== 'published' || !data.connection_id || !data.external_campaign_id) {
    throw new GoogleAdsError('plan_not_approved')
  }
  return data as ManagementPlan
}

function assertAccess(userId: string) {
  if (!resolveGoogleAdsPublishAccess(userId)) throw new GoogleAdsError('publish_disabled')
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function snapshotPerformanceRow(campaign: unknown): ManagementPerformance | null {
  if (!campaign || typeof campaign !== 'object') return null
  const row = campaign as Record<string, unknown>
  const metrics = row.metrics && typeof row.metrics === 'object' ? row.metrics as Record<string, unknown> : row
  const impressions = numberValue(metrics.impressions)
  const clicks = numberValue(metrics.clicks)
  const conversions = numberValue(metrics.conversions)
  const costMicros = numberValue(metrics.costMicros ?? metrics.cost_micros)
  if (impressions === null || clicks === null || conversions === null || costMicros === null) return null
  return {
    range: 'last_7_days',
    impressions,
    clicks,
    conversions,
    costMicros: String(Math.max(0, Math.round(costMicros))),
    ctr: impressions > 0 ? clicks / impressions : 0,
  }
}

async function readPerformance(access: GoogleAdsAccess, plan: ManagementPlan): Promise<ManagementPerformance | null> {
  try {
    const report = await access.provider.getPerformance({
      customerId: access.connection.external_account_id,
      loginCustomerId: access.connection.login_customer_id,
      accessToken: access.accessToken,
      range: '7d',
      currency: access.connection.currency_code ?? plan.currency,
      context: access.context,
    })
    const campaign = report.campaigns.find((row) => row.id === plan.external_campaign_id)
    return snapshotPerformanceRow(campaign)
  } catch {
    return null
  }
}

async function readAverageDailySpend30dMinor(access: GoogleAdsAccess, plan: ManagementPlan): Promise<number | null> {
  try {
    const currency = access.connection.currency_code ?? plan.currency
    const report = await access.provider.getPerformance({
      customerId: access.connection.external_account_id,
      loginCustomerId: access.connection.login_customer_id,
      accessToken: access.accessToken,
      range: '30d',
      currency,
      context: access.context,
    })
    const campaign = report.campaigns.find((row) => row.id === plan.external_campaign_id)
    if (!campaign || typeof campaign !== 'object') return null
    const row = campaign as Record<string, unknown>
    const metrics = row.metrics && typeof row.metrics === 'object' ? row.metrics as Record<string, unknown> : row
    const costMicros = numberValue(metrics.costMicros ?? metrics.cost_micros)
    const microsPerMinorUnit = Number(googleAdsMicrosFromMinorUnits(1, currency))
    if (costMicros === null || !Number.isSafeInteger(microsPerMinorUnit) || microsPerMinorUnit <= 0) return null
    return Math.max(0, costMicros / microsPerMinorUnit / 30)
  } catch {
    return null
  }
}

async function readCampaignState(access: GoogleAdsAccess, plan: ManagementPlan) {
  return access.provider.getCampaignManagementState({
    customerId: access.connection.external_account_id,
    loginCustomerId: access.connection.login_customer_id,
    campaignId: plan.external_campaign_id as string,
    accessToken: access.accessToken,
    context: access.context,
  })
}

async function readSnapshot(access: GoogleAdsAccess, plan: ManagementPlan) {
  const state = await readCampaignState(access, plan)
  const [review, billing, performance, averageDailySpend30dMinor] = state.campaignStatus === 'REMOVED'
    ? [
        { status: 'unavailable' as const },
        { verified: false, paymentMethodWarning: false },
        null,
        null,
      ]
    : await Promise.all([
        access.provider.getAdReviewStatus({
          customerId: access.connection.external_account_id,
          loginCustomerId: access.connection.login_customer_id,
          campaignId: plan.external_campaign_id as string,
          accessToken: access.accessToken,
          context: access.context,
        }),
        access.provider.verifyBilling({
          customerId: access.connection.external_account_id,
          loginCustomerId: access.connection.login_customer_id,
          accessToken: access.accessToken,
          context: access.context,
        }),
        readPerformance(access, plan),
        readAverageDailySpend30dMinor(access, plan),
      ])
  const storedAiRecommendation = plan.plan && typeof plan.plan === 'object'
    ? Number((plan.plan as Record<string, unknown>).aiRecommendedDailyBudgetMinor)
    : Number.NaN
  const aiRecommendation = Number.isSafeInteger(storedAiRecommendation) && storedAiRecommendation > 0
    ? storedAiRecommendation
    : null
  const stateForHash = snapshotState(state)
  return {
    state,
    snapshot: {
      ...stateForHash,
      stateHash: snapshotHash(stateForHash),
      reviewStatus: review.status,
      billingVerified: billing.verified,
      paymentMethodWarning: billing.paymentMethodWarning,
      performance,
      recommendedDailyBudgetMinor: aiRecommendation ?? plan.daily_budget_minor,
      recommendationSource: aiRecommendation !== null ? 'ai' : plan.daily_budget_minor !== null ? 'saved' : 'unavailable',
      averageDailySpend30dMinor,
    } satisfies GoogleAdsManagementSnapshot,
  }
}

function validateAdCopy(headlines: string[], descriptions: string[]) {
  if (headlines.length < 3 || headlines.length > 15 || descriptions.length < 2 || descriptions.length > 4) {
    throw new GoogleAdsError('invalid_publish_plan')
  }
  const validateLines = (lines: string[], maxLength: number, isHeadline: boolean) => {
    const seen = new Set<string>()
    for (const value of lines) {
      const normalized = value.replace(/\s+/g, ' ').trim()
      const key = normalized.toLocaleLowerCase('en-US')
      if (
        normalized !== value ||
        normalized.length === 0 ||
        normalized.length > maxLength ||
        !isCleanText(normalized) ||
        (isHeadline && normalized.includes('!')) ||
        seen.has(key)
      ) throw new GoogleAdsError('invalid_publish_plan')
      seen.add(key)
    }
  }
  validateLines(headlines, 30, true)
  validateLines(descriptions, 90, false)
  if (evaluateCopyPolicy([...headlines, ...descriptions]).verdict !== 'allowed') {
    throw new GoogleAdsError('invalid_publish_plan')
  }
}

function validateKeywordText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized !== text || !normalized || normalized.length > 80 || !isCleanText(normalized)) {
    throw new GoogleAdsError('invalid_publish_plan')
  }
}

function actionTypeFor(action: UserAction): ManagementActionType {
  if (action === 'pause' || action === 'enable') return 'google_ads_campaign_status_update'
  if (action === 'budget') return 'google_ads_budget_update'
  if (action === 'ad_copy') return 'google_ads_ad_copy_update'
  if (action === 'keyword') return 'google_ads_keyword_update'
  return 'google_ads_campaign_archive'
}

function actionMatchesTarget(state: SnapshotState, actionType: ManagementActionType, target: Record<string, unknown>) {
  if (actionType === 'google_ads_campaign_status_update') return state.campaignStatus === target.status
  if (actionType === 'google_ads_campaign_archive') return state.campaignStatus === 'REMOVED'
  if (actionType === 'google_ads_budget_update') return state.dailyBudgetMicros === String(target.dailyBudgetMicros)
  if (actionType === 'google_ads_ad_copy_update') {
    return JSON.stringify(state.headlines) === JSON.stringify(target.headlines) &&
      JSON.stringify(state.descriptions) === JSON.stringify(target.descriptions)
  }
  if (target.keywordOperation === 'add') {
    return state.keywords.some((keyword) => keyword.text === target.keywordText &&
      keyword.matchType === target.keywordMatchType && keyword.negative === (target.keywordNegative === true))
  }
  if (target.keywordOperation === 'remove') {
    return !state.keywords.some((keyword) => keyword.resourceName === target.keywordResourceName)
  }
  return false
}

async function listActions(userId: string, planId: string): Promise<RawAction[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ads_actions')
    .select('id,action_type,target,before_state,after_state,reversible,status,undone_of,failure_reason,created_at,applied_at')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .in('action_type', [...MANAGEMENT_ACTION_TYPES])
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new GoogleAdsError('provider_error')
  return (data ?? []) as unknown as RawAction[]
}

function safeAction(row: RawAction): GoogleAdsManagementAction {
  return {
    id: row.id,
    action_type: row.action_type,
    target: row.target,
    before_state: row.before_state,
    after_state: row.after_state,
    reversible: row.reversible,
    status: row.status,
    undone_of: row.undone_of,
    failure_reason: row.failure_reason,
    created_at: row.created_at,
    applied_at: row.applied_at,
  }
}

async function finishAction(input: {
  userId: string
  actionId: string
  result: 'applied' | 'failed'
  after: SnapshotState | null
  failureReason: string | null
}) {
  const rpc = createAdminClient() as unknown as AdsRpcClient
  const { data, error } = await rpc.rpc('ads_finish_google_ads_management_action_v4', {
    p_user_id: input.userId,
    p_action_id: input.actionId,
    p_result: input.result,
    p_after_state: input.after,
    p_failure_reason: input.failureReason,
  }).maybeSingle()
  const row = Array.isArray(data) ? data[0] : data
  if (error || !row || (row as { state?: string }).state !== input.result) {
    throw new GoogleAdsError('status_update_failed')
  }
}

async function reconcilePendingActions(userId: string, actionRows: RawAction[], actual: SnapshotState) {
  const staleBefore = Date.now() - 2 * 60 * 1000
  for (const action of actionRows) {
    if (action.status !== 'approved' || Date.parse(action.created_at) > staleBefore || !action.before_state) continue
    try {
      if (actionMatchesTarget(actual, action.action_type, action.target)) {
        await finishAction({ userId, actionId: action.id, result: 'applied', after: actual, failureReason: null })
      } else if (stateMatches(actual, action.before_state)) {
        await finishAction({ userId, actionId: action.id, result: 'failed', after: actual, failureReason: 'reconciled_not_applied' })
      }
    } catch {
      // Keep unresolved actions visible rather than assuming a result.
    }
  }
}

export async function getGoogleAdsManagementSnapshot(userId: string, planId: string) {
  assertAccess(userId)
  const plan = await loadManagementPlan(userId, planId)
  return withGoogleAdsPublishAccess({
    userId,
    connectionId: plan.connection_id as string,
    action: async (access) => {
      const { state, snapshot } = await readSnapshot(access, plan)
      const actions = await listActions(userId, plan.id)
      await reconcilePendingActions(userId, actions, snapshotState(state))
      const refreshedActions = await listActions(userId, plan.id)
      return {
        snapshot,
        actions: refreshedActions.map(safeAction),
      }
    },
  })
}

function minorUnitsFromMicros(micros: string, currency: string): number {
  const microsPerMinorUnit = Number(googleAdsMicrosFromMinorUnits(1, currency))
  const value = Number(micros)
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(microsPerMinorUnit) || value % microsPerMinorUnit !== 0) {
    throw new GoogleAdsError('action_not_reversible')
  }
  const result = value / microsPerMinorUnit
  if (!Number.isSafeInteger(result) || result < 1) throw new GoogleAdsError('action_not_reversible')
  return result
}

function validateStatus(snapshot: GoogleAdsManagementSnapshot, action: 'pause' | 'enable') {
  if (snapshot.campaignStatus === 'REMOVED' || snapshot.campaignStatus === 'UNKNOWN') throw new GoogleAdsError('plan_changed')
  if (action === 'pause' && snapshot.campaignStatus !== 'ENABLED') throw new GoogleAdsError('plan_changed')
  if (action === 'enable' && snapshot.campaignStatus !== 'PAUSED') throw new GoogleAdsError('plan_changed')
  if (action === 'enable') {
    if (snapshot.reviewStatus === 'disapproved') throw new GoogleAdsError('ad_disapproved')
    if (snapshot.reviewStatus === 'review_in_progress') throw new GoogleAdsError('ad_review_in_progress')
    if (snapshot.reviewStatus === 'unavailable') throw new GoogleAdsError('ad_review_status_unavailable')
  }
}

function assessPreparedActionRisk(
  prepared: PreparedAction,
  access: GoogleAdsAccess,
  plan: ManagementPlan,
  state: GoogleAdsCampaignManagementState,
  snapshot: GoogleAdsManagementSnapshot,
) {
  if (prepared.action !== 'budget') return null
  const currency = access.connection.currency_code ?? plan.currency
  const amountMinor = Number(prepared.target.dailyBudgetMinor)
  const previousDailyBudgetMinor = minorUnitsFromMicros(state.dailyBudgetMicros, currency)
  const risk = evaluateGoogleAdsAmountRisk({
    amountMinor,
    currency,
    recommendedDailyBudgetMinor: snapshot.recommendedDailyBudgetMinor,
    averageDailySpend30dMinor: snapshot.averageDailySpend30dMinor,
    previousDailyBudgetMinor,
    previousPublishedBudgetMinor: plan.daily_budget_minor,
  })
  return { amountMinor, risk, currency }
}

function formatMinorCurrency(amountMinor: number, currency: string) {
  try {
    const formatter = new Intl.NumberFormat('tr-TR', { style: 'currency', currency })
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2
    return formatter.format(amountMinor / 10 ** fractionDigits)
  } catch {
    return `${amountMinor.toLocaleString('tr-TR')} ${currency}`
  }
}

async function notifyCampaignAction(input: {
  userId: string
  plan: ManagementPlan
  prepared: PreparedAction
  actionId: string
  risk: ReturnType<typeof evaluateGoogleAdsAmountRisk> | null
  currency: string
  amountMinor: number
  previousAmountMinor: number
  stateVerified: boolean
}) {
  if (!['pause', 'enable', 'budget', 'archive'].includes(input.prepared.action)) return
  const labels: Record<string, string> = {
    pause: 'duraklatıldı',
    enable: 'devam ettirildi',
    budget: 'günlük bütçesi güncellendi',
    archive: 'arşivlendi',
  }
  const monthlyUpperBoundMinor = googleAdsMonthlyBudgetUpperBoundMinor(input.amountMinor)
  const verification = input.stateVerified ? 'Google Ads durumu doğrulandı.' : 'Değişiklik uygulandı; Google Ads durum doğrulaması tamamlanamadı.'
  const budgetDetails = input.prepared.action === 'budget'
    ? `Önceki günlük bütçe: ${formatMinorCurrency(input.previousAmountMinor, input.currency)}. Yeni günlük bütçe: ${formatMinorCurrency(input.amountMinor, input.currency)}.`
    : `Günlük bütçe: ${formatMinorCurrency(input.amountMinor, input.currency)}.`
  const body = `Kampanya ${labels[input.prepared.action]}. ${budgetDetails} 30,4 günlük tahmini harcama: ${formatMinorCurrency(monthlyUpperBoundMinor, input.currency)}. ${verification}`
  const riskReasons: Record<string, string> = {
    above_recommendation: 'ilk plan önerisinin 3 katının aşılması',
    above_recent_spend: '30 günlük ortalama günlük harcamanın 3 katının aşılması',
    fivefold_previous_budget: 'önceki bütçenin en az 5 katına çıkılması',
    absolute_threshold: 'mutlak risk eşiğinin aşılması',
  }
  const riskDetail = input.risk?.risky
    ? input.risk.reasons.map((reason) => riskReasons[reason] ?? reason).join(', ')
    : ''
  try {
    await logUserEvent({
      userId: input.userId,
      type: 'google_ads_campaign_lifecycle',
      subject: 'Google Ads kampanya değişikliği tamamlandı',
      body,
      userSubject: `Google Ads kampanyanız ${labels[input.prepared.action]}`,
      userBody: body,
      emailAdmin: Boolean(input.risk?.risky),
      adminSubject: () => '[Google Ads] Riskli bütçe işlemi onaylandı',
      adminBody: () => `${body} Risk nedenleri: ${riskDetail}. İşlem kimliği: ${input.actionId}.`,
      dedupeKey: `google_ads_management_${input.actionId}`,
    })
  } catch {
    // Notification delivery is best-effort and never changes the Ads result.
  }
}

async function resolvePreparedAction(input: ActionInput, access: GoogleAdsAccess, plan: ManagementPlan, state: GoogleAdsCampaignManagementState, snapshot: GoogleAdsManagementSnapshot): Promise<PreparedAction> {
  if (input.action === 'undo') {
    if (!input.undoActionId) throw new GoogleAdsError('invalid_request')
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('ads_actions')
      .select('id,action_type,target,before_state,after_state,reversible,status,undone_of')
      .eq('id', input.undoActionId)
      .eq('user_id', input.userId)
      .eq('plan_id', plan.id)
      .maybeSingle()
    if (error) throw new GoogleAdsError('provider_error')
    const original = data as unknown as Pick<RawAction, 'id' | 'action_type' | 'target' | 'before_state' | 'after_state' | 'reversible' | 'status' | 'undone_of'> | null
    if (!original || original.status !== 'applied' || !original.reversible || !original.after_state || original.undone_of || !original.before_state) {
      throw new GoogleAdsError('action_not_reversible')
    }
    if (!stateMatches(snapshotState(state), original.after_state)) throw new GoogleAdsError('plan_changed')

    const action: UserAction | null = original.action_type === 'google_ads_campaign_status_update'
      ? original.before_state.campaignStatus === 'PAUSED' ? 'pause' : original.before_state.campaignStatus === 'ENABLED' ? 'enable' : null
      : original.action_type === 'google_ads_budget_update' ? 'budget'
      : original.action_type === 'google_ads_ad_copy_update' ? 'ad_copy'
      : original.action_type === 'google_ads_keyword_update' ? 'keyword'
      : null
    if (!action) throw new GoogleAdsError('action_not_reversible')

    const target: Record<string, unknown> = { undoOf: original.id }
    if (action === 'pause' || action === 'enable') {
      target.status = original.before_state.campaignStatus
    } else if (action === 'budget') {
      target.dailyBudgetMinor = minorUnitsFromMicros(original.before_state.dailyBudgetMicros, access.connection.currency_code ?? plan.currency)
      target.dailyBudgetMicros = original.before_state.dailyBudgetMicros
    } else if (action === 'ad_copy') {
      validateAdCopy(original.before_state.headlines, original.before_state.descriptions)
      target.headlines = original.before_state.headlines
      target.descriptions = original.before_state.descriptions
    } else if (original.target.keywordOperation === 'add') {
      const added = state.keywords?.find((keyword) => keyword.text === original.target.keywordText &&
        keyword.matchType === original.target.keywordMatchType && keyword.negative === (original.target.keywordNegative === true))
      if (!added) throw new GoogleAdsError('plan_changed')
      Object.assign(target, {
        keywordOperation: 'remove', keywordResourceName: added.resourceName, keywordText: added.text,
        keywordMatchType: added.matchType, keywordNegative: added.negative,
      })
    } else if (original.target.keywordOperation === 'remove') {
      const removed = original.before_state.keywords.find((keyword) => keyword.resourceName === original.target.keywordResourceName)
      if (!removed) throw new GoogleAdsError('action_not_reversible')
      Object.assign(target, {
        keywordOperation: 'add', keywordText: removed.text,
        keywordMatchType: removed.matchType === 'BROAD' ? 'PHRASE' : removed.matchType,
        keywordNegative: removed.negative,
      })
    } else {
      throw new GoogleAdsError('action_not_reversible')
    }
    return { action, actionType: original.action_type, target, undoOf: original.id }
  }

  const action = input.action
  const actionType = actionTypeFor(action)
  const target: Record<string, unknown> = {}
  if (action === 'pause' || action === 'enable') {
    validateStatus(snapshot, action)
    if (action === 'enable' && snapshot.paymentMethodWarning && input.acknowledgedBillingWarning !== true) {
      throw new GoogleAdsError('confirmation_required')
    }
    target.status = action === 'enable' ? 'ENABLED' : 'PAUSED'
  } else if (action === 'budget') {
    const dailyBudgetMinor = input.dailyBudgetMinor
    if (!Number.isSafeInteger(dailyBudgetMinor) || (dailyBudgetMinor ?? 0) <= 0) throw new GoogleAdsError('invalid_budget')
    const currency = access.connection.currency_code ?? plan.currency
    buildGoogleAdsApprovalSummary({
      currency,
      dailyBudgetMinor: dailyBudgetMinor!,
    })
    const dailyBudgetMicros = googleAdsMicrosFromMinorUnits(dailyBudgetMinor!, currency)
    target.dailyBudgetMinor = dailyBudgetMinor
    target.dailyBudgetMicros = dailyBudgetMicros
  } else if (action === 'ad_copy') {
    const headlines = input.headlines ?? []
    const descriptions = input.descriptions ?? []
    validateAdCopy(headlines, descriptions)
    target.headlines = headlines
    target.descriptions = descriptions
  } else if (action === 'keyword') {
    const keywords = state.keywords ?? []
    if (input.keywordOperation === 'remove') {
      const existing = keywords.find((keyword) => keyword.resourceName === input.keywordResourceName)
      if (!existing) throw new GoogleAdsError('plan_changed')
      Object.assign(target, {
        keywordOperation: 'remove', keywordResourceName: existing.resourceName, keywordText: existing.text,
        keywordMatchType: existing.matchType, keywordNegative: existing.negative,
      })
    } else if (input.keywordOperation === 'add') {
      validateKeywordText(input.keywordText ?? '')
      if (typeof input.keywordNegative !== 'boolean' || !['EXACT', 'PHRASE'].includes(input.keywordMatchType ?? '')) throw new GoogleAdsError('invalid_request')
      if (keywords.length >= 100) throw new GoogleAdsError('invalid_publish_plan')
      if (keywords.some((keyword) => keyword.text.toLocaleLowerCase('en-US') === input.keywordText!.toLocaleLowerCase('en-US') &&
        keyword.matchType === input.keywordMatchType && keyword.negative === input.keywordNegative)) throw new GoogleAdsError('invalid_publish_plan')
      Object.assign(target, {
        keywordOperation: 'add', keywordText: input.keywordText, keywordMatchType: input.keywordMatchType,
        keywordNegative: input.keywordNegative, adGroupResourceName: state.adGroupResourceName,
      })
    } else {
      throw new GoogleAdsError('invalid_request')
    }
  } else {
    if (state.campaignStatus !== 'PAUSED') throw new GoogleAdsError('action_not_reversible')
    target.campaignStatus = 'REMOVED'
  }
  target.acknowledgedBillingWarning = input.acknowledgedBillingWarning === true
  return { action, actionType, target, undoOf: null }
}

async function performMutation(input: {
  access: GoogleAdsAccess
  plan: ManagementPlan
  state: GoogleAdsCampaignManagementState
  prepared: PreparedAction
  validateOnly: boolean
}) {
  const { access, plan, prepared, state } = input
  const { connection, provider } = access
  const customerId = connection.external_account_id
  const shared = {
    customerId,
    loginCustomerId: connection.login_customer_id,
    accessToken: access.accessToken,
    context: access.context,
    validateOnly: input.validateOnly,
    userConfirmed: true,
  }
  if (prepared.action === 'pause' || prepared.action === 'enable') {
    return provider.setCampaignStatus({
      externalAccountId: customerId,
      loginCustomerId: connection.login_customer_id,
      accessToken: access.accessToken,
      context: access.context,
      externalCampaignId: plan.external_campaign_id as string,
      status: prepared.target.status === 'ENABLED' ? 'enabled' : 'paused',
      validateOnly: input.validateOnly,
      userConfirmed: true,
    })
  }
  if (prepared.action === 'budget') {
    return provider.updateCampaignBudget({
      ...shared,
      budgetResourceName: state.budgetResourceName,
      dailyBudgetMicros: String(prepared.target.dailyBudgetMicros),
    })
  }
  if (prepared.action === 'ad_copy') {
    return provider.updateResponsiveSearchAd({
      ...shared,
      adResourceName: state.adResourceName,
      headlines: prepared.target.headlines as string[],
      descriptions: prepared.target.descriptions as string[],
    })
  }
  if (prepared.action === 'archive') {
    if (!provider.removeCampaign) throw new GoogleAdsError('provider_unavailable')
    return provider.removeCampaign({ ...shared, campaignId: plan.external_campaign_id as string })
  }
  if (!provider.mutateKeyword) throw new GoogleAdsError('provider_unavailable')
  return provider.mutateKeyword({
    ...shared,
    operation: prepared.target.keywordOperation as 'add' | 'remove',
    campaignId: plan.external_campaign_id as string,
    adGroupResourceName: state.adGroupResourceName ?? null,
    keywordResourceName: typeof prepared.target.keywordResourceName === 'string' ? prepared.target.keywordResourceName : undefined,
    keywordText: typeof prepared.target.keywordText === 'string' ? prepared.target.keywordText : undefined,
    matchType: prepared.target.keywordMatchType === 'EXACT' ? 'EXACT' : 'PHRASE',
    negative: prepared.target.keywordNegative === true,
  })
}

async function beginAction(input: {
  userId: string
  plan: ManagementPlan
  actionId: string
  actionType: ManagementActionType
  approvalHash: string
  target: Record<string, unknown>
  before: SnapshotState
  riskConfirmationRequired: boolean
  riskAcknowledged: boolean
  riskConfirmedAmountMinor: number | null
  undoOf: string | null
}) {
  const rpc = createAdminClient() as unknown as AdsRpcClient
  const { data, error } = await rpc.rpc('ads_begin_google_ads_management_action_v4', {
    p_user_id: input.userId,
    p_plan_id: input.plan.id,
    p_action_id: input.actionId,
    p_action_type: input.actionType,
    p_expected_version: input.plan.version,
    p_approval_hash: input.approvalHash,
    p_target: input.target,
    p_before_state: input.before,
    p_risk_confirmation_required: input.riskConfirmationRequired,
    p_risk_acknowledged: input.riskAcknowledged,
    p_risk_confirmed_amount_minor: input.riskConfirmedAmountMinor,
    p_user_confirmed: true,
    p_undo_of: input.undoOf,
  }).maybeSingle()
  if (error || !data) throw new GoogleAdsError('status_update_failed')
  const row = data as { state?: string; action_id?: string }
  if (row.state !== 'approved') {
    if (row.state === 'risk_confirmation_required') throw new GoogleAdsError('risk_confirmation_required')
    if (row.state === 'risk_confirmation_mismatch') throw new GoogleAdsError('risk_confirmation_mismatch')
    if (row.state === 'plan_changed') throw new GoogleAdsError('plan_changed')
    if (row.state === 'not_found') throw new GoogleAdsError('plan_not_found')
    if (row.state === 'action_not_reversible' || row.state === 'pause_before_archive') throw new GoogleAdsError('action_not_reversible')
    if (row.state === 'invalid_budget') throw new GoogleAdsError('invalid_budget')
    if (row.state === 'invalid_action' || row.state === 'invalid_status') throw new GoogleAdsError('invalid_request')
    if (row.state === 'existing' || row.state === 'idempotency_conflict') throw new GoogleAdsError('action_outcome_unknown')
    throw new GoogleAdsError('publish_in_progress')
  }
}

async function runLoggedMutation(input: {
  userId: string
  plan: ManagementPlan
  access: GoogleAdsAccess
  beforeState: GoogleAdsCampaignManagementState
  before: SnapshotState
  prepared: PreparedAction
  actionId: string
  expectedStateHash: string
  riskConfirmationRequired: boolean
  riskAcknowledged: boolean
  riskConfirmedAmountMinor: number | null
  risk: ReturnType<typeof evaluateGoogleAdsAmountRisk> | null
  currency: string
}) {
  const approvalHash = createGoogleAdsActionApprovalHash({
    userId: input.userId,
    planId: input.plan.id,
    planVersion: input.plan.version,
    connectionId: input.plan.connection_id as string,
    customerId: input.access.connection.external_account_id,
    action: input.prepared.action,
    before: input.before,
    target: input.prepared.target,
  })
  await beginAction({
    userId: input.userId,
    plan: input.plan,
    actionId: input.actionId,
    actionType: input.prepared.actionType,
    approvalHash,
    target: input.prepared.target,
    before: input.before,
    riskConfirmationRequired: input.riskConfirmationRequired,
    riskAcknowledged: input.riskAcknowledged,
    riskConfirmedAmountMinor: input.riskConfirmedAmountMinor,
    undoOf: input.prepared.undoOf,
  })

  try {
    await performMutation({ ...input, state: input.beforeState, validateOnly: true })
  } catch (error) {
    await finishAction({ userId: input.userId, actionId: input.actionId, result: 'failed', after: null, failureReason: 'validate_only_failed' })
    throw error
  }

  try {
    await performMutation({ ...input, state: input.beforeState, validateOnly: false })
  } catch (error) {
    const uncertain = !(error instanceof GoogleAdsError) || error.code === 'provider_unavailable'
    if (uncertain) {
      try {
        const actual = snapshotState(await readCampaignState(input.access, input.plan))
        if (actionMatchesTarget(actual, input.prepared.actionType, input.prepared.target)) {
          await finishAction({ userId: input.userId, actionId: input.actionId, result: 'applied', after: actual, failureReason: null })
          await notifyCampaignAction({
            userId: input.userId, plan: input.plan, prepared: input.prepared, actionId: input.actionId,
            risk: input.risk, currency: input.currency,
            amountMinor: input.prepared.action === 'budget'
              ? Number(input.prepared.target.dailyBudgetMinor)
              : minorUnitsFromMicros(input.beforeState.dailyBudgetMicros, input.currency),
            previousAmountMinor: minorUnitsFromMicros(input.beforeState.dailyBudgetMicros, input.currency),
            stateVerified: true,
          })
          return { actionId: input.actionId, afterState: actual, stateVerified: true }
        }
        if (stateMatches(actual, input.before)) {
          await finishAction({ userId: input.userId, actionId: input.actionId, result: 'failed', after: actual, failureReason: 'reconciled_not_applied' })
          throw error
        }
      } catch (reconcileError) {
        if (reconcileError === error) throw error
      }
      throw new GoogleAdsError('action_outcome_unknown')
    }
    await finishAction({ userId: input.userId, actionId: input.actionId, result: 'failed', after: null, failureReason: error instanceof GoogleAdsError ? error.code : 'provider_error' })
    throw error
  }

  let afterState: SnapshotState | null = null
  try {
    afterState = snapshotState(await readCampaignState(input.access, input.plan))
  } catch {
    afterState = null
  }
  await finishAction({
    userId: input.userId,
    actionId: input.actionId,
    result: 'applied',
    after: afterState,
    failureReason: afterState ? null : 'state_unverified',
  })
  await notifyCampaignAction({
    userId: input.userId, plan: input.plan, prepared: input.prepared, actionId: input.actionId,
    risk: input.risk, currency: input.currency,
    amountMinor: input.prepared.action === 'budget'
      ? Number(input.prepared.target.dailyBudgetMinor)
      : minorUnitsFromMicros(input.beforeState.dailyBudgetMicros, input.currency),
    previousAmountMinor: minorUnitsFromMicros(input.beforeState.dailyBudgetMicros, input.currency),
    stateVerified: afterState !== null,
  })
  return { actionId: input.actionId, afterState, stateVerified: afterState !== null }
}

export async function applyGoogleAdsManagementAction(input: ActionInput) {
  if (!input.userConfirmed) throw new GoogleAdsError('confirmation_required')
  assertAccess(input.userId)
  const plan = await loadManagementPlan(input.userId, input.planId)
  return withGoogleAdsPublishAccess({
    userId: input.userId,
    connectionId: plan.connection_id as string,
    action: async (access) => {
      if (access.connection.is_manager) throw new GoogleAdsError('manager_account')
      const { state, snapshot } = await readSnapshot(access, plan)
      if (snapshot.stateHash !== input.expectedStateHash) throw new GoogleAdsError('plan_changed')
      const prepared = await resolvePreparedAction(input, access, plan, state, snapshot)
      const riskAssessment = assessPreparedActionRisk(prepared, access, plan, state, snapshot)
      const riskError = riskAssessment
        ? googleAdsRiskConfirmationError({
            risky: riskAssessment.risk.risky,
            amountMinor: riskAssessment.amountMinor,
            riskAcknowledged: input.riskAcknowledged === true,
            riskConfirmedAmountMinor: input.riskConfirmedAmountMinor,
          })
        : input.riskAcknowledged === true || input.riskConfirmedAmountMinor != null
          ? 'risk_confirmation_mismatch'
          : null
      if (riskError) throw new GoogleAdsError(riskError)
      if (riskAssessment?.risk.risky) prepared.target.riskConfirmedAmountMinor = input.riskConfirmedAmountMinor
      const result = await runLoggedMutation({
        userId: input.userId,
        plan,
        access,
        beforeState: state,
        before: snapshotState(state),
        prepared,
        actionId: input.actionId,
        expectedStateHash: snapshot.stateHash,
        riskConfirmationRequired: Boolean(riskAssessment?.risk.risky),
        riskAcknowledged: riskAssessment?.risk.risky === true && input.riskAcknowledged === true,
        riskConfirmedAmountMinor: riskAssessment?.risk.risky ? input.riskConfirmedAmountMinor ?? null : null,
        risk: riskAssessment?.risk ?? null,
        currency: riskAssessment?.currency ?? access.connection.currency_code ?? plan.currency,
      })
      return { ...result, action: prepared.action, stateVerified: result.stateVerified }
    },
  })
}
