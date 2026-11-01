import 'server-only'

import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { beginAdsPublish, refundAdsCredits, type AdsPublishBeginResult } from '@/lib/ads/credits'
import { notifyGooglePublishReconciling } from '@/lib/ads/admin-alert'
import { resolveGoogleAdsOAuthSettings, resolveGoogleAdsPublishAccess } from '@/lib/ads/env'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import { buildGoogleAdsMutateRequest } from '@/lib/ads/google-ads-publish-plan'
import { createGoogleAdsApiTransport } from '@/lib/ads/google-api-client'
import { withGoogleAdsAccess, type GoogleAdsConnectionRow } from '@/lib/ads/google-connections'
import { createGoogleAdsProvider } from '@/lib/ads/providers/google-ads-provider'
import type {
  AdsApiOperationContext,
  AdsCampaignPublishResult,
  AdsCampaignStatusResult,
  GoogleAdsProvider,
} from '@/lib/ads/providers/types'

const PLAN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PLAN_SELECT =
  'id,user_id,connection_id,status,plan,currency,daily_budget_minor,budget_cap_minor,external_campaign_id,publish_billing_verified,google_campaign_status'

type PublishPlanRow = {
  id: string
  user_id: string
  connection_id: string | null
  status: string
  plan: unknown
  currency: string
  daily_budget_minor: number | null
  budget_cap_minor: number | null
  external_campaign_id: string | null
  publish_billing_verified: boolean | null
  google_campaign_status: 'PAUSED' | 'ENABLED'
}

type GoogleAdsPublishProvider = Pick<GoogleAdsProvider, 'publishCampaign' | 'setCampaignStatus' | 'verifyBilling'>

type GoogleAdsAccess = {
  connection: GoogleAdsConnectionRow
  accessToken: string
  context: AdsApiOperationContext
  provider: GoogleAdsPublishProvider
}

type WithAccessInput<T> = {
  userId: string
  connectionId: string
  action: (access: GoogleAdsAccess) => Promise<T>
}

export type GoogleAdsPublishFailureReason =
  | 'publish_disabled'
  | 'invalid_request'
  | 'plan_not_found'
  | 'plan_not_approved'
  | 'publish_in_progress'
  | 'reconciling'
  | 'connection_not_found'
  | 'reauth_required'
  | 'manager_account'
  | 'connection_busy'
  | 'invalid_publish_plan'
  | 'invalid_budget'
  | 'currency_mismatch'
  | 'insufficient_credits'
  | 'reservation_failed'
  | 'provider_error'
  | 'provider_unavailable'
  | 'status_update_failed'

export type GoogleAdsPublishServiceResult =
  | {
      ok: true
      state: 'published' | 'validated' | 'reconciling'
      externalCampaignId: string | null
      campaignStatus: 'paused' | 'enabled'
      billingVerified: boolean | null
      paymentMethodWarning: boolean
      creditsCharged: number | null
      balance: number | null
    }
  | { ok: false; reason: GoogleAdsPublishFailureReason; balance?: number }

export type GoogleAdsPlanStatusInput = {
  userId: string
  planId: string
  status: 'paused' | 'enabled'
}

export type GoogleAdsPlanBillingResult = {
  billingVerified: boolean
  paymentMethodWarning: boolean
}

export type GoogleAdsPublishServiceDeps = {
  accessEnabled: (userId: string) => boolean
  createRequestId: () => string
  loadPlan: (userId: string, planId: string) => Promise<PublishPlanRow | null>
  withAccess: <T>(input: WithAccessInput<T>) => Promise<T>
  beginPublish: (userId: string, planId: string, requestId: string) => Promise<AdsPublishBeginResult>
  markPublished: (input: {
    userId: string
    planId: string
    requestId: string
    externalCampaignId: string
    billingVerified: boolean
  }) => Promise<void>
  markFailed: (input: { userId: string; planId: string; requestId: string; reason: string }) => Promise<void>
  markReconciling: (input: { userId: string; planId: string; requestId: string; reason: string }) => Promise<void>
  markCampaignStatus: (input: {
    userId: string
    planId: string
    externalCampaignId: string
    status: 'PAUSED' | 'ENABLED'
    billingVerified: boolean | null
  }) => Promise<void>
  refund: (userId: string, requestId: string) => Promise<{ balance: number }>
  alertReconciling: (planId: string, requestId: string) => Promise<void>
}

function isAmbiguousCreateError(error: unknown): boolean {
  return !(error instanceof GoogleAdsError) || error.code === 'provider_unavailable'
}

function failureReason(error: unknown): GoogleAdsPublishFailureReason {
  if (error instanceof GoogleAdsError) {
    const allowed: GoogleAdsPublishFailureReason[] = [
      'publish_disabled',
      'invalid_request',
      'plan_not_found',
      'plan_not_approved',
      'publish_in_progress',
      'reconciling',
      'connection_not_found',
      'reauth_required',
      'manager_account',
      'connection_busy',
      'invalid_publish_plan',
      'invalid_budget',
      'currency_mismatch',
      'insufficient_credits',
      'reservation_failed',
      'provider_error',
      'provider_unavailable',
      'status_update_failed',
    ]
    return allowed.includes(error.code as GoogleAdsPublishFailureReason)
      ? (error.code as GoogleAdsPublishFailureReason)
      : 'provider_error'
  }
  return 'provider_error'
}

function failed(reason: GoogleAdsPublishFailureReason, balance?: number): GoogleAdsPublishServiceResult {
  return balance === undefined ? { ok: false, reason } : { ok: false, reason, balance }
}

function requirePlanBudget(plan: PublishPlanRow): { currency: string; dailyMinor: number; capMinor: number } {
  if (
    !plan.currency ||
    !/^[A-Z]{3}$/.test(plan.currency) ||
    !Number.isSafeInteger(plan.daily_budget_minor) ||
    !Number.isSafeInteger(plan.budget_cap_minor) ||
    (plan.daily_budget_minor ?? 0) <= 0 ||
    (plan.budget_cap_minor ?? 0) <= 0 ||
    (plan.daily_budget_minor ?? Number.MAX_SAFE_INTEGER) > (plan.budget_cap_minor ?? 0)
  ) {
    throw new GoogleAdsError('invalid_budget')
  }
  return {
    currency: plan.currency,
    dailyMinor: plan.daily_budget_minor as number,
    capMinor: plan.budget_cap_minor as number,
  }
}

async function defaultLoadPlan(userId: string, planId: string): Promise<PublishPlanRow | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ads_plans')
    .select(PLAN_SELECT)
    .eq('id', planId)
    .eq('user_id', userId)
    .eq('platform', 'google_ads')
    .maybeSingle()

  if (error) throw new GoogleAdsError('provider_error')
  return (data as PublishPlanRow | null) ?? null
}

async function defaultWithAccess<T>(input: WithAccessInput<T>): Promise<T> {
  const oauth = resolveGoogleAdsOAuthSettings()
  if (!oauth.ok) throw new GoogleAdsError('configuration_missing')

  const provider = createGoogleAdsProvider({
    clientId: oauth.settings.clientId,
    clientSecret: oauth.settings.clientSecret,
    redirectUri: oauth.settings.redirectUri,
    requestAdsApi: createGoogleAdsApiTransport({ userId: input.userId, connectionId: input.connectionId }),
  })

  return withGoogleAdsAccess({
    userId: input.userId,
    connectionId: input.connectionId,
    provider,
    action: (data) => input.action({ ...data, provider }),
  })
}

async function updatePlan(
  userId: string,
  planId: string,
  values: Record<string, unknown>,
  filters: Record<string, string>,
): Promise<void> {
  const admin = createAdminClient()
  let query = admin.from('ads_plans').update(values).eq('id', planId).eq('user_id', userId)
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value)
  const { data, error } = await query.select('id').maybeSingle()
  if (error || !data) throw new GoogleAdsError('status_update_failed')
}

const defaultDeps: GoogleAdsPublishServiceDeps = {
  accessEnabled: (userId) => resolveGoogleAdsPublishAccess(userId),
  createRequestId: randomUUID,
  loadPlan: defaultLoadPlan,
  withAccess: defaultWithAccess,
  beginPublish: beginAdsPublish,
  markPublished: (input) =>
    updatePlan(
      input.userId,
      input.planId,
      {
        status: 'published',
        external_campaign_id: input.externalCampaignId,
        published_at: new Date().toISOString(),
        google_campaign_status: 'PAUSED',
        publish_billing_verified: input.billingVerified,
        failure_reason: null,
      },
      { status: 'publishing', publish_request_id: input.requestId },
    ),
  markFailed: (input) =>
    updatePlan(
      input.userId,
      input.planId,
      { status: 'failed', failure_reason: input.reason },
      { status: 'publishing', publish_request_id: input.requestId },
    ),
  markReconciling: (input) =>
    updatePlan(
      input.userId,
      input.planId,
      { status: 'reconciling', failure_reason: input.reason },
      { status: 'publishing', publish_request_id: input.requestId },
    ),
  markCampaignStatus: (input) =>
    updatePlan(
      input.userId,
      input.planId,
      {
        google_campaign_status: input.status,
        ...(input.billingVerified === null ? {} : { publish_billing_verified: input.billingVerified }),
      },
      { status: 'published', external_campaign_id: input.externalCampaignId },
    ),
  refund: async (userId, requestId) => {
    const result = await refundAdsCredits(userId, 'publish', requestId)
    return { balance: result.balance }
  },
  alertReconciling: notifyGooglePublishReconciling,
}

export function createGoogleAdsPublishService(deps: GoogleAdsPublishServiceDeps = defaultDeps) {
  async function loadPlanRow(userId: string, planId: string): Promise<PublishPlanRow | GoogleAdsPublishServiceResult> {
    if (!PLAN_ID_PATTERN.test(planId)) return failed('invalid_request')
    try {
      const plan = await deps.loadPlan(userId, planId)
      return plan ?? failed('plan_not_found')
    } catch {
      return failed('provider_error')
    }
  }

  async function loadApprovedPlan(userId: string, planId: string): Promise<PublishPlanRow | GoogleAdsPublishServiceResult> {
    if (!PLAN_ID_PATTERN.test(planId)) return failed('invalid_request')
    let plan: PublishPlanRow | null
    try {
      plan = await deps.loadPlan(userId, planId)
    } catch {
      return failed('provider_error')
    }
    if (!plan) return failed('plan_not_found')
    if (plan.status === 'reconciling') return failed('reconciling')
    if (plan.status === 'publishing') return failed('publish_in_progress')
    if (plan.status === 'published' && plan.external_campaign_id) {
      return {
        ok: true,
        state: 'published',
        externalCampaignId: plan.external_campaign_id,
        campaignStatus: plan.google_campaign_status?.toLowerCase() === 'enabled' ? 'enabled' : 'paused',
        billingVerified: plan.publish_billing_verified,
        paymentMethodWarning: plan.publish_billing_verified !== true,
        creditsCharged: 0,
        balance: null,
      }
    }
    if (plan.status !== 'approved') return failed('plan_not_approved')
    if (!plan.connection_id) return failed('connection_not_found')
    try {
      requirePlanBudget(plan)
    } catch (error) {
      return failed(failureReason(error))
    }
    return plan
  }

  async function publish(input: {
    userId: string
    planId: string
    validateOnly?: boolean
  }): Promise<GoogleAdsPublishServiceResult> {
    if (!deps.accessEnabled(input.userId)) return failed('publish_disabled')
    const loaded = await loadApprovedPlan(input.userId, input.planId)
    if ('ok' in loaded) return loaded
    const plan = loaded
    const requestId = deps.createRequestId()
    if (!PLAN_ID_PATTERN.test(requestId)) return failed('invalid_request')
    const budget = requirePlanBudget(plan)

    try {
      return await deps.withAccess({
        userId: input.userId,
        connectionId: plan.connection_id as string,
        action: async ({ connection, accessToken, context, provider }) => {
          if (connection.status !== 'active' || connection.is_manager) {
            return failed(connection.is_manager ? 'manager_account' : 'reauth_required')
          }
          if (connection.currency_code !== budget.currency) return failed('currency_mismatch')

          try {
            buildGoogleAdsMutateRequest({
              customerId: connection.external_account_id,
              planJson: plan.plan,
              requestId,
              dailyBudgetMinor: budget.dailyMinor,
              budgetCapMinor: budget.capMinor,
              currency: budget.currency,
              validateOnly: Boolean(input.validateOnly),
            })
          } catch (error) {
            return failed(failureReason(error))
          }

          if (input.validateOnly) {
            try {
              const result: AdsCampaignPublishResult = await provider.publishCampaign({
                externalAccountId: connection.external_account_id,
                loginCustomerId: connection.login_customer_id,
                accessToken,
                context,
                planId: plan.id,
                requestId,
                planJson: plan.plan,
                budget,
                validateOnly: true,
              })
              return {
                ok: true,
                state: 'validated',
                externalCampaignId: null,
                campaignStatus: 'paused',
                billingVerified: result.billingVerified,
                paymentMethodWarning: result.paymentMethodWarning,
                creditsCharged: 0,
                balance: null,
              }
            } catch (error) {
              return failed(failureReason(error))
            }
          }

          let reservation: AdsPublishBeginResult
          try {
            reservation = await deps.beginPublish(input.userId, plan.id, requestId)
          } catch {
            reservation = { ok: false, reason: 'reservation_failed', balance: 0 }
          }
          if (!reservation.ok) {
            if (reservation.reason === 'reservation_failed') {
              await deps.markReconciling({
                userId: input.userId,
                planId: plan.id,
                requestId,
                reason: 'publish_reservation_result_unknown',
              }).catch(() => undefined)
              await deps.alertReconciling(plan.id, requestId)
              return {
                ok: true,
                state: 'reconciling',
                externalCampaignId: null,
                campaignStatus: 'paused',
                billingVerified: null,
                paymentMethodWarning: true,
                creditsCharged: null,
                balance: reservation.balance,
              }
            }
            return failed(reservation.reason, reservation.balance)
          }

          try {
            const result: AdsCampaignPublishResult = await provider.publishCampaign({
              externalAccountId: connection.external_account_id,
              loginCustomerId: connection.login_customer_id,
              accessToken,
              context,
              planId: plan.id,
              requestId,
              planJson: plan.plan,
              budget,
              validateOnly: false,
            })
            if (!result.externalCampaignId) throw new GoogleAdsError('provider_unavailable')

            try {
              await deps.markPublished({
                userId: input.userId,
                planId: plan.id,
                requestId,
                externalCampaignId: result.externalCampaignId,
                billingVerified: result.billingVerified,
              })
            } catch {
              await deps.markReconciling({
                userId: input.userId,
                planId: plan.id,
                requestId,
                reason: 'publish_result_persist_failed',
              }).catch(() => undefined)
              await deps.alertReconciling(plan.id, requestId)
              return {
                ok: true,
                state: 'reconciling',
                externalCampaignId: result.externalCampaignId,
                campaignStatus: 'paused',
                billingVerified: result.billingVerified,
                paymentMethodWarning: result.paymentMethodWarning,
                creditsCharged: reservation.chargedAmount,
                balance: reservation.balance,
              }
            }

            return {
              ok: true,
              state: 'published',
              externalCampaignId: result.externalCampaignId,
              campaignStatus: 'paused',
              billingVerified: result.billingVerified,
              paymentMethodWarning: result.paymentMethodWarning,
              creditsCharged: reservation.chargedAmount,
              balance: reservation.balance,
            }
          } catch (error) {
            if (isAmbiguousCreateError(error)) {
              await deps.markReconciling({
                userId: input.userId,
                planId: plan.id,
                requestId,
                reason: 'google_publish_result_unknown',
              }).catch(() => undefined)
              await deps.alertReconciling(plan.id, requestId)
              return {
                ok: true,
                state: 'reconciling',
                externalCampaignId: null,
                campaignStatus: 'paused',
                billingVerified: null,
                paymentMethodWarning: true,
                creditsCharged: reservation.chargedAmount,
                balance: reservation.balance,
              }
            }

            await deps.markFailed({
              userId: input.userId,
              planId: plan.id,
              requestId,
              reason: failureReason(error),
            }).catch(() => undefined)
            const refund = await deps.refund(input.userId, requestId)
            return failed(failureReason(error), refund.balance)
          }
        },
      })
    } catch (error) {
      return failed(failureReason(error))
    }
  }

  async function updateCampaignStatus(input: GoogleAdsPlanStatusInput): Promise<
    | { ok: true; result: AdsCampaignStatusResult }
    | { ok: false; reason: GoogleAdsPublishFailureReason }
  > {
    if (!deps.accessEnabled(input.userId)) return { ok: false, reason: 'publish_disabled' }
    const loaded = await loadPlanRow(input.userId, input.planId)
    if ('ok' in loaded) return { ok: false, reason: loaded.ok ? 'plan_not_approved' : loaded.reason }
    if (loaded.status !== 'published' || !loaded.external_campaign_id || !loaded.connection_id) {
      return { ok: false, reason: 'plan_not_approved' }
    }

    try {
      const result = await deps.withAccess({
        userId: input.userId,
        connectionId: loaded.connection_id,
        action: async ({ connection, accessToken, context, provider }) => {
          if (connection.status !== 'active' || connection.is_manager) {
            throw new GoogleAdsError(connection.is_manager ? 'manager_account' : 'reauth_required')
          }
          const status = input.status === 'enabled' ? 'enabled' : 'paused'
          const statusResult = await provider.setCampaignStatus({
            externalAccountId: connection.external_account_id,
            loginCustomerId: connection.login_customer_id,
            externalCampaignId: loaded.external_campaign_id as string,
            status,
            accessToken,
            context,
          })
          await deps.markCampaignStatus({
            userId: input.userId,
            planId: loaded.id,
            externalCampaignId: loaded.external_campaign_id as string,
            status: statusResult.status === 'enabled' ? 'ENABLED' : 'PAUSED',
            billingVerified: statusResult.billingVerified,
          })
          return statusResult
        },
      })
      return { ok: true, result }
    } catch (error) {
      return { ok: false, reason: failureReason(error) }
    }
  }

  async function getBillingStatus(input: { userId: string; planId: string }): Promise<
    | { ok: true; result: GoogleAdsPlanBillingResult }
    | { ok: false; reason: GoogleAdsPublishFailureReason }
  > {
    if (!deps.accessEnabled(input.userId)) return { ok: false, reason: 'publish_disabled' }
    const loaded = await loadPlanRow(input.userId, input.planId)
    if ('ok' in loaded) return { ok: false, reason: loaded.ok ? 'plan_not_approved' : loaded.reason }
    if (loaded.status !== 'published' || !loaded.external_campaign_id || !loaded.connection_id) {
      return { ok: false, reason: 'plan_not_approved' }
    }

    try {
      const result = await deps.withAccess({
        userId: input.userId,
        connectionId: loaded.connection_id,
        action: async ({ connection, accessToken, context, provider }) => {
          const verification = await provider.verifyBilling({
            customerId: connection.external_account_id,
            loginCustomerId: connection.login_customer_id,
            accessToken,
            context,
          })
          return {
            billingVerified: verification.verified,
            paymentMethodWarning: verification.paymentMethodWarning,
          }
        },
      })
      return { ok: true, result }
    } catch (error) {
      return { ok: false, reason: failureReason(error) }
    }
  }

  return { publish, updateCampaignStatus, getBillingStatus }
}

const defaultService = createGoogleAdsPublishService()

export function publishGoogleAdsPlan(input: { userId: string; planId: string; validateOnly?: boolean }) {
  return defaultService.publish(input)
}

export function updateGoogleAdsPlanStatus(input: GoogleAdsPlanStatusInput) {
  return defaultService.updateCampaignStatus(input)
}

export function getGoogleAdsPlanBillingStatus(input: { userId: string; planId: string }) {
  return defaultService.getBillingStatus(input)
}
