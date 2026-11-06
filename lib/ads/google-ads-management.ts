import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { AdsRpcClient } from '@/lib/ads/credits'
import {
  resolveGoogleAdsPublishDailyBudgetCapMinor,
  resolveGoogleAdsPublishAccess,
  resolveGoogleAdsKillSwitch,
  type GoogleAdsAccessIdentity,
} from '@/lib/ads/env'
import { recordGoogleAdsPolicyBlock } from '@/lib/ads/google-ads-audit'
import { isSupportedGoogleAdsCurrency } from '@/lib/ads/google-ads-publish-plan'
import { evaluateCopyPolicy } from '@/lib/ads/policy'
import { isCleanText } from '@/lib/ads/planner'
import { createGoogleAdsActionApprovalHash, hashGoogleAdsApprovalPayload } from '@/lib/ads/google-ads-approval'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import { buildGoogleAdsApprovalSummary, googleAdsMicrosFromMinorUnits } from '@/lib/ads/google-ads-publish-plan'
import { withGoogleAdsPublishAccess, type GoogleAdsAccess } from '@/lib/ads/google-ads-publish'
import type { GoogleAdsCampaignManagementState } from '@/lib/ads/providers/types'

export type GoogleAdsManagementSnapshot = {
  campaignId: string
  campaignStatus: GoogleAdsCampaignManagementState['campaignStatus']
  dailyBudgetMicros: string
  headlines: string[]
  descriptions: string[]
  stateHash: string
  reviewStatus: 'approved' | 'disapproved' | 'review_in_progress' | 'unavailable'
  billingVerified: boolean
  paymentMethodWarning: boolean
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
  budget_cap_minor: number | null
  google_daily_budget_minor: number | null
  external_campaign_id: string | null
}

type ActionInput = {
  userId: string
  accessIdentity?: GoogleAdsAccessIdentity
  planId: string
  actionId: string
  expectedVersion: number
  expectedStateHash: string
  action: 'pause' | 'enable' | 'budget' | 'ad_copy'
  dailyBudgetMinor?: number
  headlines?: string[]
  descriptions?: string[]
  acknowledgedBillingWarning?: boolean
  acknowledgedBudget?: boolean
  userConfirmed: boolean
}

type SnapshotState = Pick<
  GoogleAdsManagementSnapshot,
  'campaignId' | 'campaignStatus' | 'dailyBudgetMicros' | 'headlines' | 'descriptions'
>

function snapshotState(state: GoogleAdsCampaignManagementState): SnapshotState {
  return {
    campaignId: state.campaignId,
    campaignStatus: state.campaignStatus,
    dailyBudgetMicros: state.dailyBudgetMicros,
    headlines: state.headlines,
    descriptions: state.descriptions,
  }
}

async function loadManagementPlan(userId: string, planId: string): Promise<ManagementPlan> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ads_plans')
    .select('id,user_id,connection_id,status,version,approved_version,currency,daily_budget_minor,budget_cap_minor,google_daily_budget_minor,external_campaign_id')
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

function assertAccess(userId: string, identity?: GoogleAdsAccessIdentity) {
  if (!resolveGoogleAdsPublishAccess(userId, process.env, identity)) throw new GoogleAdsError('publish_disabled')
}

async function readSnapshot(access: GoogleAdsAccess, plan: ManagementPlan) {
  const state = await access.provider.getCampaignManagementState({
    customerId: access.connection.external_account_id,
    loginCustomerId: access.connection.login_customer_id,
    campaignId: plan.external_campaign_id as string,
    accessToken: access.accessToken,
    context: access.context,
  })
  const [review, billing] = await Promise.all([
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
  ])
  const stateForHash = snapshotState(state)
  return {
    state,
    snapshot: {
      ...stateForHash,
      stateHash: hashGoogleAdsApprovalPayload(stateForHash),
      reviewStatus: review.status,
      billingVerified: billing.verified,
      paymentMethodWarning: billing.paymentMethodWarning,
    } satisfies GoogleAdsManagementSnapshot,
  }
}

export async function getGoogleAdsManagementSnapshot(
  userId: string,
  planId: string,
  accessIdentity?: GoogleAdsAccessIdentity,
) {
  assertAccess(userId, accessIdentity)
  const plan = await loadManagementPlan(userId, planId)
  return withGoogleAdsPublishAccess({
    userId,
    connectionId: plan.connection_id as string,
    identity: accessIdentity,
    action: (access) => readSnapshot(access, plan).then(({ snapshot }) => snapshot),
  })
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

export async function applyGoogleAdsManagementAction(input: ActionInput) {
  assertAccess(input.userId, input.accessIdentity)
  if (input.userConfirmed !== true) throw new GoogleAdsError('confirmation_required')
  const plan = await loadManagementPlan(input.userId, input.planId)
  if (plan.version !== input.expectedVersion || plan.approved_version !== input.expectedVersion) {
    throw new GoogleAdsError('plan_changed')
  }

  return withGoogleAdsPublishAccess({
    userId: input.userId,
    connectionId: plan.connection_id as string,
    identity: input.accessIdentity,
    action: async (access) => {
      const { connection, provider } = access
      if (connection.status !== 'active' || connection.is_manager) {
        throw new GoogleAdsError(connection.is_manager ? 'manager_account' : 'reauth_required')
      }
      const currency = connection.currency_code
      if (!currency) throw new GoogleAdsError('currency_mismatch')
      if (!isSupportedGoogleAdsCurrency(currency)) throw new GoogleAdsError('unsupported_currency')
      const { state, snapshot } = await readSnapshot(access, plan)
      const before = snapshotState(state)
      if (hashGoogleAdsApprovalPayload(before) !== input.expectedStateHash) {
        throw new GoogleAdsError('plan_changed')
      }

      const userDailyBudgetLimitMinor = resolveGoogleAdsPublishDailyBudgetCapMinor(currency)
      const target: Record<string, unknown> = {}
      let actionType: string
      const planAction = input.action

      if (input.action === 'pause' || input.action === 'enable') {
        actionType = 'google_ads_campaign_status_update'
        target.status = input.action === 'enable' ? 'ENABLED' : 'PAUSED'
        if (input.action === 'enable') {
          if (resolveGoogleAdsKillSwitch()) {
            await recordGoogleAdsPolicyBlock({ userId: input.userId, planId: plan.id, reason: 'kill_switch_active', operation: 'enable' })
            throw new GoogleAdsError('kill_switch_active')
          }
          if (input.acknowledgedBudget !== true) throw new GoogleAdsError('confirmation_required')
          if (snapshot.paymentMethodWarning && input.acknowledgedBillingWarning !== true) {
            throw new GoogleAdsError('confirmation_required')
          }
          if (snapshot.reviewStatus === 'disapproved') throw new GoogleAdsError('ad_disapproved')
          if (snapshot.reviewStatus === 'review_in_progress') throw new GoogleAdsError('ad_review_in_progress')
          if (snapshot.reviewStatus === 'unavailable') throw new GoogleAdsError('ad_review_status_unavailable')
        }
      } else if (input.action === 'budget') {
        actionType = 'google_ads_budget_update'
        const dailyBudgetMinor = input.dailyBudgetMinor
        if (!Number.isSafeInteger(dailyBudgetMinor) || (dailyBudgetMinor ?? 0) <= 0) {
          throw new GoogleAdsError('invalid_budget')
        }
        if (!userDailyBudgetLimitMinor || dailyBudgetMinor! > userDailyBudgetLimitMinor) {
          throw new GoogleAdsError('budget_limit_exceeded')
        }
        buildGoogleAdsApprovalSummary({
          currency,
          dailyBudgetMinor: dailyBudgetMinor as number,
          budgetCapMinor: userDailyBudgetLimitMinor,
        })
        target.dailyBudgetMinor = dailyBudgetMinor
        target.dailyBudgetMicros = googleAdsMicrosFromMinorUnits(dailyBudgetMinor as number, currency)
        if (resolveGoogleAdsKillSwitch() && BigInt(target.dailyBudgetMicros as string) > BigInt(snapshot.dailyBudgetMicros)) {
          await recordGoogleAdsPolicyBlock({ userId: input.userId, planId: plan.id, reason: 'kill_switch_active', operation: 'budget_increase' })
          throw new GoogleAdsError('kill_switch_active')
        }
      } else {
        actionType = 'google_ads_ad_copy_update'
        const headlines = input.headlines ?? []
        const descriptions = input.descriptions ?? []
        validateAdCopy(headlines, descriptions)
        target.headlines = headlines
        target.descriptions = descriptions
      }
      target.acknowledgedBillingWarning = input.acknowledgedBillingWarning === true
      target.acknowledgedBudget = input.acknowledgedBudget === true

      const approvalHash = createGoogleAdsActionApprovalHash({
        userId: input.userId,
        planId: plan.id,
        planVersion: plan.version,
        connectionId: connection.id,
        customerId: connection.external_account_id,
        action: planAction,
        before,
        target,
      })

      const admin = createAdminClient()
      const rpc = admin as unknown as AdsRpcClient
      const { data: beginData, error: beginError } = await rpc.rpc('ads_begin_google_ads_campaign_action_e2', {
        p_user_id: input.userId,
        p_plan_id: plan.id,
        p_action_id: input.actionId,
        p_action_type: actionType,
        p_expected_version: plan.version,
        p_approval_hash: approvalHash,
        p_target: target,
        p_before_state: before,
        p_user_daily_budget_limit_minor: userDailyBudgetLimitMinor,
        p_user_confirmed: true,
      }).maybeSingle()
      if (beginError || !beginData) throw new GoogleAdsError('status_update_failed')
      const begin = beginData as { state?: string; action_id?: string }
      if (begin.state !== 'approved') {
        if (begin.state === 'budget_limit_exceeded') throw new GoogleAdsError('budget_limit_exceeded')
        if (begin.state === 'plan_changed') throw new GoogleAdsError('plan_changed')
        if (begin.state === 'not_found') throw new GoogleAdsError('plan_not_found')
        throw new GoogleAdsError('publish_in_progress')
      }
      const actionId = begin.action_id ?? input.actionId

      const mutationInput = {
        externalAccountId: connection.external_account_id,
        loginCustomerId: connection.login_customer_id,
        accessToken: access.accessToken,
        context: access.context,
        userConfirmed: true,
      }
      try {
        if (input.action === 'pause' || input.action === 'enable') {
          await provider.setCampaignStatus({
            ...mutationInput,
            externalCampaignId: plan.external_campaign_id as string,
            status: input.action === 'enable' ? 'enabled' : 'paused',
            validateOnly: true,
          })
          await provider.setCampaignStatus({
            ...mutationInput,
            externalCampaignId: plan.external_campaign_id as string,
            status: input.action === 'enable' ? 'enabled' : 'paused',
            validateOnly: false,
          })
        } else if (input.action === 'budget') {
          const dailyBudgetMicros = String(target.dailyBudgetMicros)
          await provider.updateCampaignBudget({
            accessToken: access.accessToken,
            customerId: connection.external_account_id,
            loginCustomerId: connection.login_customer_id,
            context: access.context,
            budgetResourceName: state.budgetResourceName,
            dailyBudgetMicros,
            validateOnly: true,
            userConfirmed: true,
          })
          await provider.updateCampaignBudget({
            accessToken: access.accessToken,
            customerId: connection.external_account_id,
            loginCustomerId: connection.login_customer_id,
            context: access.context,
            budgetResourceName: state.budgetResourceName,
            dailyBudgetMicros,
            validateOnly: false,
            userConfirmed: true,
          })
        } else {
          await provider.updateResponsiveSearchAd({
            accessToken: access.accessToken,
            customerId: connection.external_account_id,
            loginCustomerId: connection.login_customer_id,
            context: access.context,
            adResourceName: state.adResourceName,
            headlines: input.headlines ?? [],
            descriptions: input.descriptions ?? [],
            validateOnly: true,
            userConfirmed: true,
          })
          await provider.updateResponsiveSearchAd({
            accessToken: access.accessToken,
            customerId: connection.external_account_id,
            loginCustomerId: connection.login_customer_id,
            context: access.context,
            adResourceName: state.adResourceName,
            headlines: input.headlines ?? [],
            descriptions: input.descriptions ?? [],
            validateOnly: false,
            userConfirmed: true,
          })
        }
      } catch (error) {
        if (!(error instanceof GoogleAdsError) || error.code === 'provider_unavailable') {
          throw error
        }
        await rpc.rpc('ads_finish_google_ads_campaign_action_e2', {
          p_user_id: input.userId,
          p_action_id: actionId,
          p_result: 'failed',
          p_after_state: null,
          p_failure_reason: error.code,
        }).maybeSingle()
        throw error
      }

      const fallbackAfter: SnapshotState = {
        ...before,
        ...(input.action === 'pause' || input.action === 'enable'
          ? { campaignStatus: input.action === 'enable' ? 'ENABLED' : 'PAUSED' }
          : {}),
        ...(input.action === 'budget' ? { dailyBudgetMicros: String(target.dailyBudgetMicros) } : {}),
        ...(input.action === 'ad_copy'
          ? { headlines: input.headlines ?? [], descriptions: input.descriptions ?? [] }
          : {}),
      }
      const after = await provider.getCampaignManagementState({
        customerId: connection.external_account_id,
        loginCustomerId: connection.login_customer_id,
        campaignId: plan.external_campaign_id as string,
        accessToken: access.accessToken,
        context: access.context,
      }).then(snapshotState).catch(() => fallbackAfter)
      const afterState = { ...after }
      const { data: finishData, error: finishError } = await rpc.rpc('ads_finish_google_ads_campaign_action_e2', {
        p_user_id: input.userId,
        p_action_id: actionId,
        p_result: 'applied',
        p_after_state: afterState,
        p_failure_reason: null,
      }).maybeSingle()
      const finish = Array.isArray(finishData) ? finishData[0] : finishData
      if (finishError || !finish || (finish as { state?: string }).state !== 'applied') {
        throw new GoogleAdsError('status_update_failed')
      }

      return {
        actionId,
        approvalHash,
        before,
        target,
        after: afterState,
        billingVerified: snapshot.billingVerified,
        paymentMethodWarning: snapshot.paymentMethodWarning,
        campaignStatus: afterState.campaignStatus,
      }
    },
  })
}
