import { resolveMetaGraphApiVersion } from '@/lib/ads/env'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { createMetaApiClient } from '@/lib/ads/meta-api-client'
import { withMetaAccess } from '@/lib/ads/meta-connections'
import {
  activateMetaPlan,
  metaEffectiveHeadline,
  pauseMetaPlan,
  toLiveSnapshot,
  updateMetaBudget,
  type MetaManageOutcome,
} from '@/lib/ads/meta-manage'
import {
  META_MANAGE_TERMS_VERSION,
  classifyBudgetChange,
  formatMetaMoney,
  metaSpendConsentText,
  type MetaManageAction,
} from '@/lib/ads/meta-manage-ux'
import { assertMetaManageable, guardMetaManageRoute, isUuid, readJsonObject } from '@/lib/ads/meta-plan-route'
import { META_STEP_LABELS } from '@/lib/ads/meta-publish-errors'
import { adsManagerUrl, dailyBudgetToMinor } from '@/lib/ads/meta-publish-plan'
import { getMetaPlan, metaPlanView } from '@/lib/ads/meta-plans-store'
import { metaAdsErrorResponse, metaAdsJson } from '@/lib/ads/meta-route-utils'
import { buildMetaManageEmail } from '@/lib/email/ads-mail'
import { logUserEvent } from '@/lib/notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ACTIONS: readonly MetaManageAction[] = ['activate', 'pause', 'budget']

const RESERVE_ERRORS: Record<string, ConstructorParameters<typeof MetaAdsError>[0]> = {
  not_found: 'plan_not_found',
  plan_not_ready: 'transition_not_allowed',
  transition_not_allowed: 'transition_not_allowed',
  terms_required: 'terms_required',
  manage_in_progress: 'manage_in_progress',
  in_flight_duplicate: 'manage_in_progress',
  already_failed: 'transition_not_allowed',
  idempotency_conflict: 'invalid_request',
  invalid_request: 'invalid_request',
}

const MAIL_SUBJECTS: Record<MetaManageAction, string> = {
  activate: 'Meta kampanyanız etkinleştirildi',
  pause: 'Meta kampanyanız duraklatıldı',
  budget: 'Meta günlük bütçeniz güncellendi',
}

export async function POST(request: Request) {
  const guard = await guardMetaManageRoute(request, { key: 'meta-plans-manage', limit: 6 })
  if (!guard.ok) return guard.response
  const body = await readJsonObject(request)
  if (!body || !isUuid(body.planId) || !isUuid(body.requestId) || typeof body.action !== 'string' || !ACTIONS.includes(body.action as MetaManageAction)) {
    return metaAdsJson({ ok: false, error: 'invalid_request' }, 400)
  }
  const action = body.action as MetaManageAction
  const termsAccepted = body.termsAccepted === true
  const { userId } = guard.access
  const { canManage } = guard.access.decision
  const admin = guard.admin

  try {
    const plan = await getMetaPlan(admin, userId, body.planId)
    if (!plan) throw new MetaAdsError('plan_not_found')
    if (!plan.meta_campaign_id || !plan.meta_adset_id || !plan.meta_ad_id) throw new MetaAdsError('transition_not_allowed')
    const ids = { campaignId: plan.meta_campaign_id, adSetId: plan.meta_adset_id, adId: plan.meta_ad_id }

    let newBudgetMinor: number | null = null
    let increase = false
    if (action === 'budget') {
      const parsed = dailyBudgetToMinor(typeof body.dailyBudget === 'string' || typeof body.dailyBudget === 'number' ? body.dailyBudget : '', plan.currency)
      if (!parsed.ok) throw new MetaAdsError('invalid_request')
      const change = classifyBudgetChange(plan.daily_budget_minor, parsed.minor)
      if (change === 'same' || change === 'invalid') throw new MetaAdsError('transition_not_allowed')
      newBudgetMinor = parsed.minor
      increase = change === 'increase'
    }

    // Spend-increasing actions need the full permission; pause and budget decreases only the protective one.
    if ((action === 'activate' || increase) && !canManage) throw new MetaAdsError('manage_not_allowed')
    if ((action === 'activate' || increase) && !termsAccepted) throw new MetaAdsError('terms_required')

    const consentBudget = newBudgetMinor ?? plan.daily_budget_minor
    const consent = action === 'activate' || increase
      ? {
          terms_version: META_MANAGE_TERMS_VERSION,
          text: metaSpendConsentText(consentBudget, plan.currency, action),
          daily_budget_minor: consentBudget,
          currency: plan.currency,
          accepted_at: new Date().toISOString(),
        }
      : null

    const { data: reserved, error: reserveError } = await admin.rpc('ads_reserve_meta_manage_action', {
      p_user_id: userId,
      p_plan_id: plan.id,
      p_connection_id: plan.connection_id,
      p_request_id: body.requestId,
      p_action: action,
      p_new_budget_minor: newBudgetMinor,
      p_terms_accepted: termsAccepted,
      p_consent: consent,
    }).maybeSingle()
    if (reserveError || !reserved) throw new MetaAdsError('provider_error')
    const reservation = reserved as { state?: string; action_id?: string }
    if (reservation.state === 'already_applied') {
      const current = await getMetaPlan(admin, userId, plan.id)
      return metaAdsJson({ ok: true, alreadyApplied: true, plan: current ? metaPlanView(current) : null })
    }
    if (reservation.state !== 'reserved' || !reservation.action_id) {
      throw new MetaAdsError(RESERVE_ERRORS[reservation.state ?? ''] ?? 'invalid_request')
    }
    const actionId = reservation.action_id

    const finish = async (input: {
      outcome: 'applied' | 'failed' | 'unknown'
      planStatus?: 'active' | 'user_paused' | null
      budgetMinor?: number | null
      effective?: string | null
      failureCode?: string | null
      snapshot?: Record<string, unknown> | null
    }) => {
      const { error } = await admin.rpc('ads_finish_meta_manage_action', {
        p_user_id: userId,
        p_plan_id: plan.id,
        p_action_id: actionId,
        p_outcome: input.outcome,
        p_new_plan_status: input.planStatus ?? null,
        p_new_budget_minor: input.budgetMinor ?? null,
        p_effective_status: input.effective ?? null,
        p_failure_code: input.failureCode ?? null,
        p_snapshot: input.snapshot ?? null,
      })
      if (error) console.error('[meta-ads] finish manage failed')
    }

    const graph = createMetaApiClient()
    const apiVersion = resolveMetaGraphApiVersion()
    let accountExternalId: string | null = null

    let outcome: MetaManageOutcome
    try {
      outcome = await withMetaAccess({
        userId,
        connectionId: plan.connection_id,
        action: async ({ connection, accessToken, context }) => {
          assertMetaManageable(connection)
          if (connection.currency_code !== plan.currency) throw new MetaAdsError('plan_changed')
          accountExternalId = connection.external_account_id
          const common = { graph, accessToken, context, accountId: connection.external_account_id, apiVersion, ids }
          if (action === 'activate') return activateMetaPlan({ ...common, planCurrency: plan.currency })
          if (action === 'pause') return pauseMetaPlan(common)
          return updateMetaBudget({ ...common, dailyBudgetMinor: newBudgetMinor as number })
        },
      })
    } catch (error) {
      await finish({ outcome: 'failed', failureCode: error instanceof MetaAdsError ? error.code : 'provider_error' })
      throw error
    }

    if (outcome.ok) {
      await finish({
        outcome: 'applied',
        planStatus: action === 'activate' ? 'active' : action === 'pause' ? 'user_paused' : null,
        budgetMinor: action === 'budget' ? newBudgetMinor : null,
        effective: outcome.live ? metaEffectiveHeadline(outcome.live) : null,
        snapshot: outcome.live ? toLiveSnapshot(outcome.live) : null,
      })
      try {
        const money = formatMetaMoney(action === 'budget' ? newBudgetMinor : plan.daily_budget_minor, plan.currency)
        await logUserEvent({
          userId,
          type: `meta_ads_manage_${action}`,
          subject: MAIL_SUBJECTS[action],
          body: MAIL_SUBJECTS[action],
          userEmail: () => buildMetaManageEmail({
            action,
            campaignName: plan.content.name,
            dailyBudget: money,
            previousDailyBudget: action === 'budget' ? formatMetaMoney(plan.daily_budget_minor, plan.currency) : undefined,
            verified: outcome.ok && outcome.verified,
            adsManagerUrl: accountExternalId ? adsManagerUrl(accountExternalId, ids.campaignId) : null,
          }),
          dedupeKey: `meta_ads_manage_${action}_${body.requestId}`,
        })
      } catch {
        // A delivery problem never changes the action result.
      }
      const fresh = await getMetaPlan(admin, userId, plan.id)
      return metaAdsJson({ ok: true, verified: outcome.verified, plan: fresh ? metaPlanView(fresh) : null, live: outcome.live })
    }

    await finish({
      outcome: outcome.unknown ? 'unknown' : 'failed',
      failureCode: outcome.failure.code,
      effective: outcome.live ? metaEffectiveHeadline(outcome.live) : null,
    })
    const fresh = await getMetaPlan(admin, userId, plan.id)
    return metaAdsJson({
      ok: false,
      error: outcome.unknown ? 'write_outcome_unknown' : outcome.failure.code,
      step: outcome.step,
      stepLabel: outcome.step === 'verify' ? 'Doğrulama' : META_STEP_LABELS[outcome.step],
      message: outcome.failure.message,
      metaReason: outcome.failure.metaReason,
      unknown: outcome.unknown,
      plan: fresh ? metaPlanView(fresh) : null,
      live: outcome.live,
    }, outcome.unknown ? 503 : 422)
  } catch (error) {
    return metaAdsErrorResponse(error)
  }
}
