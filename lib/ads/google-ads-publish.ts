import 'server-only'

import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  beginAdsGooglePublishE2,
  finalizeAdsGooglePublishE2,
  releaseAdsGooglePublishE2,
  type AdsGooglePublishFinalizeResult,
  type AdsPublishBeginResult,
} from '@/lib/ads/credits'
import { createGoogleAdsPlanApprovalHash } from '@/lib/ads/google-ads-approval'
import { logUserEvent } from '@/lib/notify'
import {
  buildAdsPublishFailedEmail,
  buildAdsPublishSucceededEmail,
  buildAdsValidationFailedEmail,
  buildAdsValidationPassedEmail,
} from '@/lib/email/ads-mail'
import {
  notifyGooglePublishFailure,
  notifyGooglePublishReconciling,
  type GooglePublishFailureStage,
  type GooglePublishReconciliationReason,
} from '@/lib/ads/admin-alert'
import {
  resolveGoogleAdsOAuthSettings,
  resolveGoogleAdsPublishAccess,
  resolveGoogleAdsValidateOnlyTestEnabled,
  resolveGoogleAdsKillSwitch,
  resolveGoogleAdsPublishLimits,
  type GoogleAdsAccessIdentity,
} from '@/lib/ads/env'
import { reserveGoogleAdsPublishCapacity, finishGoogleAdsPublishCapacity } from '@/lib/ads/google-publish-capacity'
import { recordGoogleAdsPolicyBlock } from '@/lib/ads/google-ads-audit'
import { googleErrorFailureCode, type GoogleErrorDetail } from '@/lib/ads/google-error-detail'
import { isSupportedGoogleAdsCurrency } from '@/lib/ads/google-ads-publish-plan'
import { GOOGLE_ADS_PUBLISH_TERMS_VERSION } from '@/lib/ads/google-terms'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import {
  buildGoogleAdsApprovalSummary,
  parseGoogleAdsPublishPlan,
  type GoogleAdsApprovalSummary,
} from '@/lib/ads/google-ads-publish-plan'
import {
  preflightGoogleAdsPublishUrl,
  type GoogleAdsPublishPreflightResult,
} from '@/lib/ads/google-ads-publish-preflight'
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
  'id,user_id,connection_id,status,plan,version,approved_version,approval_summary,approval_id,approval_hash,validation_hash,validated_version,validated_at,eu_political_advertising,eu_political_declaration_confirmed_at,publish_credit_charged,currency,daily_budget_minor,google_daily_budget_minor,external_campaign_id,publish_request_id,publish_started_at,publish_billing_verified,google_campaign_status'
const STALE_PUBLISH_AFTER_MS = 10 * 60 * 1000

type PublishPlanRow = {
  id: string
  user_id: string
  connection_id: string | null
  status: string
  plan: unknown
  version: number
  approved_version: number | null
  approval_summary: unknown
  approval_id: string | null
  acceptedTermsVersion?: string | null
  approval_hash: string | null
  validation_hash: string | null
  validated_version: number | null
  validated_at: string | null
  eu_political_advertising: 'yes' | 'no' | null
  eu_political_declaration_confirmed_at: string | null
  publish_credit_charged: boolean | null
  google_daily_budget_minor: number | null
  currency: string
  daily_budget_minor: number | null
  external_campaign_id: string | null
  publish_request_id: string | null
  publish_started_at: string | null
  publish_billing_verified: boolean | null
  google_campaign_status: 'PAUSED' | 'ENABLED' | 'REMOVED' | 'UNKNOWN'
}

type GoogleAdsPublishProvider = Pick<
  GoogleAdsProvider,
  | 'publishCampaign'
  | 'setCampaignStatus'
  | 'verifyBilling'
  | 'getCampaignManagementState'
  | 'getPerformance'
  | 'removeCampaign'
  | 'mutateKeyword'
  | 'getAdReviewStatus'
  | 'updateCampaignBudget'
  | 'updateResponsiveSearchAd'
>

export type GoogleAdsAccess = {
  connection: GoogleAdsConnectionRow
  accessToken: string
  context: AdsApiOperationContext
  provider: GoogleAdsPublishProvider
}

type WithAccessInput<T> = {
  userId: string
  connectionId: string
  identity?: GoogleAdsAccessIdentity
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
  | 'eu_political_declaration_required'
  | 'invalid_budget'
  | 'currency_mismatch'
  | 'destination_unreachable'
  | 'site_policy_blocked'
  | 'insufficient_credits'
  | 'reservation_failed'
  | 'publish_not_started'
  | 'provider_error'
  | 'provider_unavailable'
  | 'api_quota_exceeded'
  | 'quota_check_failed'
  | 'not_authorized'
  | 'google_access_level_insufficient'
  | 'configuration_missing'
  | 'status_update_failed'
  | 'plan_changed'
  | 'confirmation_required'
  | 'ad_disapproved'
  | 'ad_review_in_progress'
  | 'ad_review_status_unavailable'
  | 'kill_switch_active'
  | 'user_publish_limit_reached'
  | 'global_publish_limit_reached'
  | 'unsupported_currency'
  | 'terms_reaccept_required'

export type GoogleAdsPublishServiceResult =
  | {
      ok: true
      state: 'published' | 'validated' | 'validation_test_passed' | 'reconciling'
      externalCampaignId: string | null
      campaignStatus: 'paused' | 'enabled'
      billingVerified: boolean | null
      paymentMethodWarning: boolean
      creditsCharged: number | null
      balance: number | null
      approvalSummary?: GoogleAdsApprovalSummary
    }
  | { ok: false; reason: GoogleAdsPublishFailureReason; balance?: number; googleErrors?: GoogleErrorDetail[] }

export type GoogleAdsPlanStatusInput = {
  userId: string
  accessIdentity?: GoogleAdsAccessIdentity
  planId: string
  status: 'paused' | 'enabled'
  validateOnly?: boolean
  userConfirmed: boolean
  acknowledgedBillingWarning?: boolean
  acknowledgedBudget?: boolean
}

export type GoogleAdsPlanBillingResult = {
  billingVerified: boolean
  paymentMethodWarning: boolean
}

export type GoogleAdsPublishServiceDeps = {
  accessEnabled: (userId: string, identity?: GoogleAdsAccessIdentity) => boolean
  reservePublishCapacity: typeof reserveGoogleAdsPublishCapacity
  finishPublishCapacity: typeof finishGoogleAdsPublishCapacity
  validationTestEnabled: (userId: string) => boolean
  createRequestId: () => string
  loadPlan: (userId: string, planId: string) => Promise<PublishPlanRow | null>
  withAccess: <T>(input: WithAccessInput<T>) => Promise<T>
  preflightPublishUrl: (finalUrl: string) => Promise<GoogleAdsPublishPreflightResult>
  beginPublish: (
    userId: string,
    planId: string,
    requestId: string,
    expectedVersion: number,
    approvalSummary: GoogleAdsApprovalSummary,
    approvalId: string,
    approvalHash: string,
  ) => Promise<AdsPublishBeginResult>
  markValidated: (input: {
    userId: string
    planId: string
    expectedVersion: number
    approvalId: string
    approvalHash: string
  }) => Promise<void>
  markPublished: (input: {
    userId: string
    planId: string
    requestId: string
    externalCampaignId: string
    billingVerified: boolean
  }) => Promise<AdsGooglePublishFinalizeResult>
  markFailed: (input: { userId: string; planId: string; requestId: string; reason: string }) => Promise<void>
  markReconciling: (input: { userId: string; planId: string; requestId: string; reason: string }) => Promise<void>
  markCampaignStatus: (input: {
    userId: string
    planId: string
    externalCampaignId: string
    status: 'PAUSED' | 'ENABLED'
    billingVerified: boolean | null
  }) => Promise<void>

  alertReconciling: (
    planId: string,
    requestId: string,
    reason: GooglePublishReconciliationReason,
  ) => Promise<void>
  alertPublishFailure: (
    planId: string,
    requestId: string,
    reason: GoogleAdsPublishFailureReason,
    stage: GooglePublishFailureStage,
    googleErrors?: readonly GoogleErrorDetail[],
  ) => Promise<void>
  recordGoogleFailure?: (input: {
    userId: string
    planId: string
    connectionId: string
    operation: GooglePublishFailureStage
    reason: GoogleAdsPublishFailureReason
    googleErrors: readonly GoogleErrorDetail[]
  }) => Promise<void>
  notifyUser?: (input: PublishUserNotification) => Promise<void>
}

export type PublishUserNotification = {
  userId: string
  requestId: string
  outcome: 'validation_passed' | 'validation_failed' | 'published' | 'failed'
  reason?: string
  creditsCharged?: number | null
}

/** Customer e-mail delivery is best-effort and never changes the publish result. */
async function notifyUserOutcome(deps: GoogleAdsPublishServiceDeps, input: PublishUserNotification) {
  try {
    await deps.notifyUser?.(input)
  } catch {
    // Intentionally swallowed.
  }
}

async function defaultNotifyUser(input: PublishUserNotification): Promise<void> {
  const mail = (() => {
    switch (input.outcome) {
      case 'validation_passed':
        return { subject: 'Google Ads planınız doğrulandı', build: () => buildAdsValidationPassedEmail() }
      case 'validation_failed':
        return { subject: 'Google Ads planınız doğrulanamadı', build: () => buildAdsValidationFailedEmail({ reason: input.reason }) }
      case 'published':
        return {
          subject: 'Google Ads kampanyanız duraklatılmış olarak oluşturuldu',
          build: () => buildAdsPublishSucceededEmail({ creditsCharged: input.creditsCharged }),
        }
      case 'failed':
        return { subject: 'Google Ads yayını tamamlanamadı', build: () => buildAdsPublishFailedEmail({ reason: input.reason }) }
    }
  })()
  await logUserEvent({
    userId: input.userId,
    type: `google_ads_publish_${input.outcome}`,
    subject: mail.subject,
    body: mail.subject,
    userEmail: mail.build,
    dedupeKey: `google_ads_publish_${input.outcome}_${input.requestId}`,
  })
}

function googleErrorsOf(error: unknown): GoogleErrorDetail[] {
  return error instanceof GoogleAdsError ? [...error.details] : []
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
      'eu_political_declaration_required',
      'invalid_budget',
      'currency_mismatch',
      'insufficient_credits',
      'reservation_failed',
      'publish_not_started',
      'provider_error',
      'provider_unavailable',
      'api_quota_exceeded',
      'quota_check_failed',
      'not_authorized',
      'google_access_level_insufficient',
      'configuration_missing',
      'status_update_failed',
      'plan_changed',
      'confirmation_required',
      'ad_disapproved',
      'ad_review_in_progress',
      'ad_review_status_unavailable',
      'kill_switch_active',
          'user_publish_limit_reached',
      'global_publish_limit_reached',
      'unsupported_currency',
      'terms_reaccept_required',
    ]
    return allowed.includes(error.code as GoogleAdsPublishFailureReason)
      ? (error.code as GoogleAdsPublishFailureReason)
      : 'provider_error'
  }
  return 'provider_error'
}

function failed(
  reason: GoogleAdsPublishFailureReason,
  balance?: number,
  googleErrors: readonly GoogleErrorDetail[] = [],
): GoogleAdsPublishServiceResult {
  return {
    ok: false,
    reason,
    ...(balance === undefined ? {} : { balance }),
    ...(googleErrors.length ? { googleErrors: [...googleErrors] } : {}),
  }
}

function requirePlanBudget(plan: PublishPlanRow): { currency: string; dailyMinor: number } {
  if (!plan.currency || !/^[A-Z]{3}$/.test(plan.currency)) throw new GoogleAdsError('invalid_budget')
  if (!isSupportedGoogleAdsCurrency(plan.currency)) throw new GoogleAdsError('unsupported_currency')
  if (
    !Number.isSafeInteger(plan.daily_budget_minor) ||
    (plan.daily_budget_minor ?? 0) <= 0
  ) {
    throw new GoogleAdsError('invalid_budget')
  }
  try {
    buildGoogleAdsApprovalSummary({ currency: plan.currency, dailyBudgetMinor: plan.daily_budget_minor as number })
  } catch {
    throw new GoogleAdsError('invalid_budget')
  }
  return { currency: plan.currency, dailyMinor: plan.daily_budget_minor as number }
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
  const plan = (data as PublishPlanRow | null) ?? null
  if (!plan?.approval_id) return plan ? { ...plan, acceptedTermsVersion: null } : null

  const { data: approval, error: approvalError } = await admin
    .from('ads_google_publish_approvals')
    .select('terms_accepted_at,approval_summary')
    .eq('id', plan.approval_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (approvalError) throw new GoogleAdsError('provider_error')
  const summary = approval?.approval_summary
  const termsVersion = summary && typeof summary === 'object' && 'termsVersion' in summary
    && typeof (summary as Record<string, unknown>).termsVersion === 'string'
    ? (summary as Record<string, string>).termsVersion
    : null
  return { ...plan, acceptedTermsVersion: approval?.terms_accepted_at ? termsVersion : null }
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
    action: (data) => input.action({
      ...data,
      context: { ...data.context, googleAdsAccess: input.identity },
      provider,
    }),
  })
}

export function withGoogleAdsPublishAccess<T>(input: WithAccessInput<T>): Promise<T> {
  return defaultWithAccess(input)
}

async function updatePlan(
  userId: string,
  planId: string,
  values: Record<string, unknown>,
  filters: Record<string, string | string[]>,
): Promise<void> {
  const admin = createAdminClient()
  let query = admin.from('ads_plans').update(values).eq('id', planId).eq('user_id', userId)
  for (const [column, value] of Object.entries(filters)) {
    query = Array.isArray(value) ? query.in(column, value) : query.eq(column, value)
  }
  const { data, error } = await query.select('id').maybeSingle()
  if (error || !data) throw new GoogleAdsError('status_update_failed')
}

function approvedPlanJson(plan: PublishPlanRow): unknown {
  if (
    (plan.eu_political_advertising !== 'yes' && plan.eu_political_advertising !== 'no') ||
    !plan.eu_political_declaration_confirmed_at
  ) {
    throw new GoogleAdsError('confirmation_required')
  }
  return {
    ...parseGoogleAdsPublishPlan(plan.plan),
    euPoliticalAdvertising: plan.eu_political_advertising,
    euPoliticalDeclarationConfirmed: true,
  }
}

const defaultDeps: GoogleAdsPublishServiceDeps = {
  accessEnabled: (userId, identity) => resolveGoogleAdsPublishAccess(userId, process.env, identity),
  reservePublishCapacity: reserveGoogleAdsPublishCapacity,
  finishPublishCapacity: finishGoogleAdsPublishCapacity,
  validationTestEnabled: () => resolveGoogleAdsValidateOnlyTestEnabled(),
  createRequestId: randomUUID,
  loadPlan: defaultLoadPlan,
  withAccess: defaultWithAccess,
  preflightPublishUrl: preflightGoogleAdsPublishUrl,
  beginPublish: (userId, planId, requestId, expectedVersion, approvalSummary, approvalId, approvalHash) =>
    beginAdsGooglePublishE2({
      userId,
      planId,
      requestId,
      expectedVersion,
      approvalId,
      approvalHash,
      approvalSummary,
    }),
  markValidated: async (input) => {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('ads_record_google_ads_validation_e2', {
      p_user_id: input.userId,
      p_plan_id: input.planId,
      p_expected_version: input.expectedVersion,
      p_approval_id: input.approvalId,
      p_plan_hash: input.approvalHash,
    })
    const result = Array.isArray(data) ? data[0] : data
    if (error || !result || (result as { state?: string }).state !== 'validated') {
      throw new GoogleAdsError('status_update_failed')
    }
  },
  markPublished: (input) => finalizeAdsGooglePublishE2(input),
  markFailed: async (input) => {
    const released = await releaseAdsGooglePublishE2(input)
    if (!released) throw new GoogleAdsError('status_update_failed')
  },
  markReconciling: (input) =>
    updatePlan(
      input.userId,
      input.planId,
      { status: 'reconciling', failure_reason: input.reason },
      { status: ['publishing', 'failed'], publish_request_id: input.requestId },
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
  alertReconciling: (planId, requestId, reason) =>
    notifyGooglePublishReconciling(planId, requestId, undefined, reason),
  alertPublishFailure: (planId, requestId, reason, stage, googleErrors) =>
    notifyGooglePublishFailure(planId, requestId, reason, stage, undefined, googleErrors),
  notifyUser: defaultNotifyUser,
  recordGoogleFailure: (input) =>
    recordGoogleAdsPolicyBlock({
      userId: input.userId,
      planId: input.planId,
      connectionId: input.connectionId,
      reason: googleErrorFailureCode(input.googleErrors, input.reason),
      baseReason: input.reason,
      operation: input.operation,
      googleErrors: input.googleErrors,
    }),
}

async function reportGoogleFailure(
  deps: GoogleAdsPublishServiceDeps,
  input: {
    userId: string
    planId: string
    connectionId: string
    requestId: string
    operation: GooglePublishFailureStage
    reason: GoogleAdsPublishFailureReason
    googleErrors: readonly GoogleErrorDetail[]
  },
): Promise<void> {
  if (input.googleErrors.length) {
    await deps.recordGoogleFailure?.({
      userId: input.userId,
      planId: input.planId,
      connectionId: input.connectionId,
      operation: input.operation,
      reason: input.reason,
      googleErrors: input.googleErrors,
    }).catch(() => undefined)
  }
  await (input.googleErrors.length
    ? deps.alertPublishFailure(input.planId, input.requestId, input.reason, input.operation, input.googleErrors)
    : deps.alertPublishFailure(input.planId, input.requestId, input.reason, input.operation)
  ).catch(() => undefined)
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

  type StalePublishPlan = { stalePublishingPlan: PublishPlanRow }

  async function loadApprovedPlan(
    userId: string,
    planId: string,
    expectedVersion?: number,
  ): Promise<PublishPlanRow | StalePublishPlan | GoogleAdsPublishServiceResult> {
    if (
      !PLAN_ID_PATTERN.test(planId) ||
      (expectedVersion !== undefined && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1))
    ) {
      return failed('invalid_request')
    }
    let plan: PublishPlanRow | null
    try {
      plan = await deps.loadPlan(userId, planId)
    } catch {
      return failed('provider_error')
    }
    if (!plan) return failed('plan_not_found')
    const approvedVersion = expectedVersion ?? plan.approved_version
    if (
      typeof approvedVersion !== 'number' ||
      !Number.isSafeInteger(approvedVersion) ||
      approvedVersion < 1 ||
      plan.version !== approvedVersion ||
      plan.approved_version !== approvedVersion
    ) return failed('plan_changed')
    if (!plan.approval_id || !plan.approval_hash) {
      return failed('confirmation_required')
    }
    if (
      !plan.eu_political_declaration_confirmed_at ||
      (plan.eu_political_advertising !== 'yes' && plan.eu_political_advertising !== 'no')
    ) {
      return failed('eu_political_declaration_required')
    }
    if (plan.status === 'reconciling') return failed('reconciling')
    if (plan.status === 'publishing') {
      const startedAt = plan.publish_started_at ? Date.parse(plan.publish_started_at) : Number.NaN
      if (Number.isFinite(startedAt) && Date.now() - startedAt >= STALE_PUBLISH_AFTER_MS) {
        return { stalePublishingPlan: plan }
      }
      return failed('publish_in_progress')
    }
    if (plan.status === 'published' && plan.external_campaign_id) {
      try {
        return {
          ok: true,
          state: 'published',
          externalCampaignId: plan.external_campaign_id,
          campaignStatus: plan.google_campaign_status?.toLowerCase() === 'enabled' ? 'enabled' : 'paused',
          billingVerified: plan.publish_billing_verified,
          paymentMethodWarning: plan.publish_billing_verified !== true,
          creditsCharged: plan.publish_credit_charged ? 15 : 0,
          balance: null,
          approvalSummary: buildGoogleAdsApprovalSummary({
            currency: plan.currency,
            dailyBudgetMinor: plan.daily_budget_minor as number,
          }),
        }
      } catch (error) {
        return failed(failureReason(error))
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

  async function loadValidationTestPlan(
    userId: string,
    planId: string,
    euPoliticalAdvertising: 'yes' | 'no',
  ): Promise<PublishPlanRow | GoogleAdsPublishServiceResult> {
    const loaded = await loadPlanRow(userId, planId)
    if ('ok' in loaded) return loaded
    if (!Number.isSafeInteger(loaded.version) || loaded.version < 1) return failed('plan_changed')
    if (!['draft', 'failed', 'approved'].includes(loaded.status) || loaded.external_campaign_id) {
      return failed('plan_not_approved')
    }
    if (loaded.status === 'approved') {
      if (loaded.approved_version !== loaded.version || loaded.eu_political_advertising !== euPoliticalAdvertising) {
        return failed('plan_changed')
      }
      if (!loaded.eu_political_declaration_confirmed_at) return failed('eu_political_declaration_required')
    }
    if (!loaded.connection_id) return failed('connection_not_found')
    if (loaded.acceptedTermsVersion !== undefined && loaded.acceptedTermsVersion !== GOOGLE_ADS_PUBLISH_TERMS_VERSION) {
      return failed('terms_reaccept_required')
    }
    try {
      requirePlanBudget(loaded)
    } catch (error) {
      return failed(failureReason(error))
    }
    return loaded
  }

  async function publish(input: {
    userId: string
    accessIdentity?: GoogleAdsAccessIdentity
    planId: string
    expectedVersion?: number
    approvalHash?: string
    userConfirmed: boolean
    validateOnly?: boolean
    validationTestMode?: boolean
    euPoliticalAdvertising?: 'yes' | 'no'
    euPoliticalDeclarationConfirmed?: boolean
    finalConfirmation?: boolean
  }): Promise<GoogleAdsPublishServiceResult> {
    const validationTestMode = input.validationTestMode === true
    if (validationTestMode) {
      if (input.validateOnly !== true || !deps.validationTestEnabled(input.userId)) return failed('publish_disabled')
      if (
        (input.euPoliticalAdvertising !== 'yes' && input.euPoliticalAdvertising !== 'no') ||
        input.euPoliticalDeclarationConfirmed !== true
      ) return failed('eu_political_declaration_required')
    } else if (!deps.accessEnabled(input.userId, input.accessIdentity)) {
      return failed('publish_disabled')
    }
    if (!input.validateOnly && resolveGoogleAdsKillSwitch()) {
      await recordGoogleAdsPolicyBlock({ userId: input.userId, planId: input.planId, reason: 'kill_switch_active', operation: 'publish' })
      return failed('kill_switch_active')
    }
    if (input.userConfirmed !== true) return failed('confirmation_required')
    if (!input.validateOnly && input.finalConfirmation !== true) return failed('confirmation_required')
    if (
      !validationTestMode &&
      (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion ?? 0) < 1 || !/^[a-f0-9]{64}$/.test(input.approvalHash ?? ''))
    ) return failed('confirmation_required')

    const loaded = validationTestMode
      ? await loadValidationTestPlan(input.userId, input.planId, input.euPoliticalAdvertising as 'yes' | 'no')
      : await loadApprovedPlan(input.userId, input.planId, input.expectedVersion)
    if ('ok' in loaded) {
      if (validationTestMode && loaded.ok) return failed('plan_not_approved')
      return loaded
    }
    if ('stalePublishingPlan' in loaded) {
      if (validationTestMode) return failed('reconciling')
      const stalePlan = loaded.stalePublishingPlan
      const staleRequestId = stalePlan.publish_request_id
      if (staleRequestId) {
        await deps.markReconciling({
          userId: input.userId,
          planId: stalePlan.id,
          requestId: staleRequestId,
          reason: 'publish_stale_timeout',
        }).catch(() => undefined)
        await deps.alertReconciling(stalePlan.id, staleRequestId, 'publish_stale_timeout')
      }
      let approvalSummary: GoogleAdsApprovalSummary | undefined
      try {
        approvalSummary = buildGoogleAdsApprovalSummary({
          currency: stalePlan.currency,
          dailyBudgetMinor: stalePlan.daily_budget_minor as number,
        })
      } catch {
        approvalSummary = undefined
      }
      return {
        ok: true,
        state: 'reconciling',
        externalCampaignId: stalePlan.external_campaign_id,
        campaignStatus: 'paused',
        billingVerified: stalePlan.publish_billing_verified,
        paymentMethodWarning: true,
        creditsCharged: null,
        balance: null,
        ...(approvalSummary ? { approvalSummary } : {}),
      }
    }
    const plan = loaded
    const expectedVersion = validationTestMode ? plan.version : input.expectedVersion ?? plan.version
    const approvalHash = validationTestMode ? 'validate-only-test' : input.approvalHash ?? ''
    if (!validationTestMode) {
      if (!/^[a-f0-9]{64}$/.test(approvalHash)) return failed('confirmation_required')
      if (plan.approval_hash !== approvalHash) return failed('plan_changed')
      if (
        !input.validateOnly &&
        (plan.validation_hash !== approvalHash || plan.validated_version !== expectedVersion)
      ) return failed('confirmation_required')
      if (!plan.approval_id) return failed('confirmation_required')
    }
    const requestId = deps.createRequestId()
    if (!PLAN_ID_PATTERN.test(requestId)) return failed('invalid_request')
    const budget = requirePlanBudget(plan)
    const approvalSummary = buildGoogleAdsApprovalSummary({
      currency: budget.currency,
      dailyBudgetMinor: budget.dailyMinor,
    })

    let planJson: unknown
    let finalUrl: string
    try {
      planJson = validationTestMode
        ? {
            ...parseGoogleAdsPublishPlan(plan.plan),
            euPoliticalAdvertising: input.euPoliticalAdvertising,
            euPoliticalDeclarationConfirmed: true,
          }
        : approvedPlanJson(plan)
      finalUrl = parseGoogleAdsPublishPlan(planJson).finalUrl
    } catch (error) {
      return failed(failureReason(error))
    }

    let preflight: GoogleAdsPublishPreflightResult
    try {
      preflight = await deps.preflightPublishUrl(finalUrl)
    } catch {
      return failed('destination_unreachable')
    }
    if (!preflight.ok) return failed(preflight.reason)

    try {
      return await deps.withAccess({
        userId: input.userId,
        identity: input.accessIdentity,
        connectionId: plan.connection_id as string,
        action: async ({ connection, accessToken, context, provider }) => {
          if (connection.status !== 'active' || connection.is_manager) {
            return failed(connection.is_manager ? 'manager_account' : 'reauth_required')
          }
          if (connection.currency_code !== budget.currency) return failed('currency_mismatch')
          if (!validationTestMode) {
            const recomputedApprovalHash = createGoogleAdsPlanApprovalHash({
              userId: input.userId,
              planId: plan.id,
              planVersion: plan.version,
              connectionId: connection.id,
              customerId: connection.external_account_id,
              currency: budget.currency,
              dailyBudgetMinor: budget.dailyMinor,
              plan: planJson,
            })
            if (recomputedApprovalHash !== approvalHash) return failed('plan_changed')
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
                planJson,
                budget,
                validateOnly: true,
                validationTestMode,
                userConfirmed: true,
              })
              if (!validationTestMode) {
                await deps.markValidated({
                  userId: input.userId,
                  planId: plan.id,
                  expectedVersion,
                  approvalId: plan.approval_id as string,
                  approvalHash,
                })
                await notifyUserOutcome(deps, {
                  userId: input.userId,
                  requestId,
                  outcome: 'validation_passed',
                })
              }
              return {
                ok: true,
                state: validationTestMode ? 'validation_test_passed' : 'validated',
                externalCampaignId: null,
                campaignStatus: 'paused',
                billingVerified: result.billingVerified,
                paymentMethodWarning: result.paymentMethodWarning,
                creditsCharged: 0,
                balance: null,
                approvalSummary,
              }
            } catch (error) {
              const reason = failureReason(error)
              const googleErrors = googleErrorsOf(error)
              await reportGoogleFailure(deps, {
                userId: input.userId,
                planId: plan.id,
                connectionId: connection.id,
                requestId,
                operation: 'validate_only',
                reason,
                googleErrors,
              })
              if (!validationTestMode) {
                await notifyUserOutcome(deps, {
                  userId: input.userId,
                  requestId,
                  outcome: 'validation_failed',
                  reason,
                })
              }
              return failed(reason, undefined, googleErrors)
            }
          }

          let capacityActionId: string
          try {
            const capacity = await deps.reservePublishCapacity({
              userId: input.userId,
              planId: plan.id,
              connectionId: connection.id,
              requestId,
              limits: resolveGoogleAdsPublishLimits(),
            })
            capacityActionId = capacity.actionId
          } catch (error) {
            return failed(failureReason(error))
          }

          let reservation: AdsPublishBeginResult
          try {
            reservation = await deps.beginPublish(
              input.userId,
              plan.id,
              requestId,
              expectedVersion,
              approvalSummary,
              plan.approval_id as string,
              approvalHash,
            )
          } catch {
            reservation = { ok: false, reason: 'reservation_failed', balance: 0 }
          }
          if (!reservation.ok) {
            if (reservation.reason === 'reservation_failed') {
              const current = await deps.loadPlan(input.userId, plan.id).catch(() => null)
              const reservationTookEffect =
                !current || (current.status === 'publishing' && current.publish_request_id === requestId)
              if (!reservationTookEffect) {
                await deps.finishPublishCapacity({
                  userId: input.userId,
                  actionId: capacityActionId,
                  outcome: 'failure',
                  reasonCode: 'publish_not_started',
                })
                await notifyUserOutcome(deps, {
                  userId: input.userId,
                  requestId,
                  outcome: 'failed',
                  reason: 'publish_not_started',
                })
                return failed('publish_not_started', reservation.balance)
              }
              await deps.markReconciling({
                userId: input.userId,
                planId: plan.id,
                requestId,
                reason: 'publish_reservation_result_unknown',
              }).catch(() => undefined)
              await deps.alertReconciling(plan.id, requestId, 'publish_reservation_result_unknown')
              return {
                ok: true,
                state: 'reconciling',
                externalCampaignId: null,
                campaignStatus: 'paused',
                billingVerified: null,
                paymentMethodWarning: true,
                creditsCharged: null,
                balance: reservation.balance,
                approvalSummary,
              }
            }
            await deps.finishPublishCapacity({
              userId: input.userId,
              actionId: capacityActionId,
              outcome: 'failure',
              reasonCode: reservation.reason,
            })
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
              planJson,
              budget,
              validateOnly: false,
              userConfirmed: true,
            })
            if (!result.externalCampaignId) throw new GoogleAdsError('provider_unavailable')

            let settlement: AdsGooglePublishFinalizeResult
            try {
              settlement = await deps.markPublished({
                userId: input.userId,
                planId: plan.id,
                requestId,
                externalCampaignId: result.externalCampaignId,
                billingVerified: result.billingVerified,
              })
              if (!settlement.ok) throw new GoogleAdsError('status_update_failed')
            } catch {
              await deps.markReconciling({
                userId: input.userId,
                planId: plan.id,
                requestId,
                reason: 'publish_result_persist_failed',
              }).catch(() => undefined)
              await deps.alertReconciling(plan.id, requestId, 'publish_result_persist_failed')
              return {
                ok: true,
                state: 'reconciling',
                externalCampaignId: result.externalCampaignId,
                campaignStatus: 'paused',
                billingVerified: result.billingVerified,
                paymentMethodWarning: result.paymentMethodWarning,
                creditsCharged: null,
                balance: reservation.balance,
                approvalSummary,
              }
            }

            await deps.finishPublishCapacity({
              userId: input.userId,
              actionId: capacityActionId,
              outcome: 'success',
            })
            await notifyUserOutcome(deps, {
              userId: input.userId,
              requestId,
              outcome: 'published',
              creditsCharged: settlement.chargedAmount,
            })
            return {
              ok: true,
              state: 'published',
              externalCampaignId: result.externalCampaignId,
              campaignStatus: 'paused',
              billingVerified: result.billingVerified,
              paymentMethodWarning: result.paymentMethodWarning,
              creditsCharged: settlement.chargedAmount,
              balance: settlement.balance,
              approvalSummary,
            }
          } catch (error) {
            if (isAmbiguousCreateError(error)) {
              await deps.markReconciling({
                userId: input.userId,
                planId: plan.id,
                requestId,
                reason: 'google_publish_result_unknown',
              }).catch(() => undefined)
              await deps.alertReconciling(plan.id, requestId, 'google_publish_result_unknown')
              return {
                ok: true,
                state: 'reconciling',
                externalCampaignId: null,
                campaignStatus: 'paused',
                billingVerified: null,
                paymentMethodWarning: true,
                creditsCharged: null,
                balance: reservation.balance,
                approvalSummary,
              }
            }

            const reason = failureReason(error)
            try {
              await deps.markFailed({
                userId: input.userId,
                planId: plan.id,
                requestId,
                reason,
              })
            } catch {
              await deps.markReconciling({
                userId: input.userId,
                planId: plan.id,
                requestId,
                reason: 'publish_failure_persist_failed',
              }).catch(() => undefined)
              await deps.alertReconciling(plan.id, requestId, 'publish_failure_persist_failed')
              return {
                ok: true,
                state: 'reconciling',
                externalCampaignId: null,
                campaignStatus: 'paused',
                billingVerified: null,
                paymentMethodWarning: true,
                creditsCharged: null,
                balance: reservation.balance,
                approvalSummary,
              }
            }

            await deps.finishPublishCapacity({
              userId: input.userId,
              actionId: capacityActionId,
              outcome: 'failure',
              reasonCode: reason,
            })
            const googleErrors = googleErrorsOf(error)
            await reportGoogleFailure(deps, {
              userId: input.userId,
              planId: plan.id,
              connectionId: connection.id,
              requestId,
              operation: 'publish',
              reason,
              googleErrors,
            })
            await notifyUserOutcome(deps, {
              userId: input.userId,
              requestId,
              outcome: 'failed',
              reason,
            })
            return failed(reason, reservation.balance, googleErrors)
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
    if (!deps.accessEnabled(input.userId, input.accessIdentity)) return { ok: false, reason: 'publish_disabled' }
    if (input.status === 'enabled' && resolveGoogleAdsKillSwitch()) {
      await recordGoogleAdsPolicyBlock({ userId: input.userId, planId: input.planId, reason: 'kill_switch_active', operation: 'enable' })
      return { ok: false, reason: 'kill_switch_active' }
    }
    if (input.userConfirmed !== true) return { ok: false, reason: 'confirmation_required' }
    if (
      input.status === 'enabled' &&
      (input.acknowledgedBillingWarning !== true || input.acknowledgedBudget !== true)
    ) {
      return { ok: false, reason: 'confirmation_required' }
    }
    const loaded = await loadPlanRow(input.userId, input.planId)
    if ('ok' in loaded) return { ok: false, reason: loaded.ok ? 'plan_not_approved' : loaded.reason }
    if (loaded.status !== 'published' || !loaded.external_campaign_id || !loaded.connection_id) {
      return { ok: false, reason: 'plan_not_approved' }
    }

    try {
      const result = await deps.withAccess({
        userId: input.userId,
        identity: input.accessIdentity,
        connectionId: loaded.connection_id,
        action: async ({ connection, accessToken, context, provider }) => {
          if (connection.status !== 'active' || connection.is_manager) {
            throw new GoogleAdsError(connection.is_manager ? 'manager_account' : 'reauth_required')
          }
          const status = input.status === 'enabled' ? 'enabled' : 'paused'
          if (status === 'enabled') {
            const review = await provider.getAdReviewStatus({
              customerId: connection.external_account_id,
              loginCustomerId: connection.login_customer_id,
              campaignId: loaded.external_campaign_id as string,
              accessToken,
              context,
            })
            if (review.status === 'disapproved') throw new GoogleAdsError('ad_disapproved')
            if (review.status === 'review_in_progress') throw new GoogleAdsError('ad_review_in_progress')
            if (review.status === 'unavailable') throw new GoogleAdsError('ad_review_status_unavailable')
          }
          const statusResult = await provider.setCampaignStatus({
            externalAccountId: connection.external_account_id,
            loginCustomerId: connection.login_customer_id,
            externalCampaignId: loaded.external_campaign_id as string,
            status,
            accessToken,
            context,
            validateOnly: Boolean(input.validateOnly),
            userConfirmed: true,
          })
          if (!input.validateOnly) {
            await deps.markCampaignStatus({
              userId: input.userId,
              planId: loaded.id,
              externalCampaignId: loaded.external_campaign_id as string,
              status: statusResult.status === 'enabled' ? 'ENABLED' : 'PAUSED',
              billingVerified: statusResult.billingVerified,
            })
          }
          return statusResult
        },
      })
      return { ok: true, result }
    } catch (error) {
      return { ok: false, reason: failureReason(error) }
    }
  }

  async function getBillingStatus(input: { userId: string; planId: string; accessIdentity?: GoogleAdsAccessIdentity }): Promise<
    | { ok: true; result: GoogleAdsPlanBillingResult }
    | { ok: false; reason: GoogleAdsPublishFailureReason }
  > {
    if (!deps.accessEnabled(input.userId, input.accessIdentity)) return { ok: false, reason: 'publish_disabled' }
    const loaded = await loadPlanRow(input.userId, input.planId)
    if ('ok' in loaded) return { ok: false, reason: loaded.ok ? 'plan_not_approved' : loaded.reason }
    if (loaded.status !== 'published' || !loaded.external_campaign_id || !loaded.connection_id) {
      return { ok: false, reason: 'plan_not_approved' }
    }

    try {
      const result = await deps.withAccess({
        userId: input.userId,
        identity: input.accessIdentity,
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

export function publishGoogleAdsPlan(input: {
  userId: string
  accessIdentity?: GoogleAdsAccessIdentity
  planId: string
  expectedVersion?: number
  approvalHash?: string
  userConfirmed: boolean
  validateOnly?: boolean
  validationTestMode?: boolean
  euPoliticalAdvertising?: 'yes' | 'no'
  euPoliticalDeclarationConfirmed?: boolean
  finalConfirmation?: boolean
}) {
  return defaultService.publish(input)
}

export function updateGoogleAdsPlanStatus(input: GoogleAdsPlanStatusInput) {
  return defaultService.updateCampaignStatus(input)
}

export function getGoogleAdsPlanBillingStatus(input: { userId: string; planId: string; accessIdentity?: GoogleAdsAccessIdentity }) {
  return defaultService.getBillingStatus(input)
}
