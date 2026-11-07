/**
 * Phase M3 orchestration: live status read, activate / pause / budget change and drift detection.
 * No I/O of its own: the Graph client is injected so the same code runs under the route handlers and under the
 * mocked tests. Write calls are never retried here or in the client; an unknown write outcome is resolved by
 * reading the object back, never by writing again.
 */
import { MetaAdsError, isMetaAdsError } from '@/lib/ads/meta-ads-error'
import type { MetaApiContext } from '@/lib/ads/meta-api-client'
import { preflightMetaAccount, type MetaGraph } from '@/lib/ads/meta-publish'
import { describeMetaPublishError, type MetaPublishFailure, type MetaPublishStep } from '@/lib/ads/meta-publish-errors'

type Common = {
  graph: MetaGraph
  accessToken: string
  context: MetaApiContext
  accountId: string
  apiVersion: string
}

export type MetaManagedIds = { campaignId: string; adSetId: string; adId: string }

export type MetaObjectState = {
  /** Configured status (what GLOVAL or the owner set): ACTIVE | PAUSED | ARCHIVED | DELETED. */
  status: string | null
  /** What Meta actually does with it: ACTIVE, PENDING_REVIEW, DISAPPROVED, CAMPAIGN_PAUSED ... */
  effectiveStatus: string | null
}

export type MetaLiveSpend = {
  todayMajor: number | null
  last7DaysMajor: number | null
  impressionsToday: number | null
  impressions7Days: number | null
}

export type MetaLiveState = {
  campaign: MetaObjectState
  adSet: MetaObjectState & { dailyBudgetMinor: number | null }
  ad: MetaObjectState & { reviewFeedback: string | null }
  spend: MetaLiveSpend | null
  fetchedAt: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function text(value: unknown, max = 40): string | null {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null
}

function wholeNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(parsed) ? parsed : null
}

function decimal(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,12}(\.\d{1,8})?$/.test(value) ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

/** Meta returns review feedback as { placement: { reason: text } } or a list; keep only a short readable summary. */
function summarizeReviewFeedback(value: unknown): string | null {
  const reasons: string[] = []
  const collect = (node: unknown, depth: number) => {
    if (depth > 3 || reasons.length >= 3) return
    if (typeof node === 'string') {
      const clean = node.replace(/\s+/g, ' ').trim()
      if (clean) reasons.push(clean.slice(0, 160))
      return
    }
    if (Array.isArray(node)) { node.forEach((item) => collect(item, depth + 1)); return }
    if (node && typeof node === 'object') Object.values(node as Record<string, unknown>).forEach((item) => collect(item, depth + 1))
  }
  collect(value, 0)
  return reasons.length > 0 ? [...new Set(reasons)].join(' · ').slice(0, 320) : null
}

/* ----------------------------- live state ----------------------------- */

async function readObject(
  input: Common,
  endpoint: 'campaign.status' | 'adset.status' | 'ad.status',
  id: string,
  fields: string,
): Promise<Record<string, unknown>> {
  return asRecord(await input.graph.request({
    endpoint,
    path: `/${id}`,
    accessToken: input.accessToken,
    query: { fields },
    context: input.context,
  }))
}

async function readSpend(input: Common, campaignId: string): Promise<MetaLiveSpend | null> {
  const read = async (preset: 'today' | 'last_7d') => {
    const body = asRecord(await input.graph.request({
      endpoint: 'act.insights.campaign',
      path: `/${campaignId}/insights`,
      accessToken: input.accessToken,
      query: { fields: 'spend,impressions', date_preset: preset },
      context: input.context,
    }))
    const row = asRecord(Array.isArray(body.data) ? body.data[0] : null)
    return { spend: decimal(row.spend) ?? 0, impressions: wholeNumber(row.impressions) ?? 0 }
  }
  try {
    const [today, week] = await Promise.all([read('today'), read('last_7d')])
    return {
      todayMajor: today.spend,
      last7DaysMajor: week.spend + today.spend,
      impressionsToday: today.impressions,
      impressions7Days: week.impressions + today.impressions,
    }
  } catch {
    // Spend is informational; a failed insights read must never block a status read or an action.
    return null
  }
}

export async function readMetaLiveState(input: Common & { ids: MetaManagedIds; includeSpend?: boolean; now?: Date }): Promise<MetaLiveState> {
  const [campaign, adSet, ad] = await Promise.all([
    readObject(input, 'campaign.status', input.ids.campaignId, 'id,status,effective_status'),
    readObject(input, 'adset.status', input.ids.adSetId, 'id,status,effective_status,daily_budget'),
    readObject(input, 'ad.status', input.ids.adId, 'id,status,effective_status,ad_review_feedback'),
  ])
  const spend = input.includeSpend === false ? null : await readSpend(input, input.ids.campaignId)
  return {
    campaign: { status: text(campaign.status), effectiveStatus: text(campaign.effective_status) },
    adSet: { status: text(adSet.status), effectiveStatus: text(adSet.effective_status), dailyBudgetMinor: wholeNumber(adSet.daily_budget) },
    ad: { status: text(ad.status), effectiveStatus: text(ad.effective_status), reviewFeedback: summarizeReviewFeedback(ad.ad_review_feedback) },
    spend,
    fetchedAt: (input.now ?? new Date()).toISOString(),
  }
}

/* ----------------------------- drift ----------------------------- */

export type MetaPlanLiveStatus = 'published' | 'active' | 'user_paused' | 'archived'

export type MetaSyncDecision = {
  /** null = keep the stored status. */
  planStatus: MetaPlanLiveStatus | null
  budgetMinor: number | null
  effectiveStatus: string | null
  drift: boolean
}

/** The headline status of the ad set / ad that decides whether spend is possible. */
export function metaEffectiveHeadline(live: MetaLiveState): string | null {
  return live.ad.effectiveStatus ?? live.adSet.effectiveStatus ?? live.campaign.effectiveStatus
}

/**
 * Maps what Meta reports onto the stored plan status. Only "ACTIVE everywhere" promotes to active, only a paused
 * object demotes an active plan; a never-activated (published) plan that is still paused is not drift.
 */
export function decideMetaSync(plan: { status: string; dailyBudgetMinor: number | null }, live: MetaLiveState): MetaSyncDecision {
  const configured = [live.campaign.status, live.adSet.status, live.ad.status]
  let planStatus: MetaPlanLiveStatus | null = null
  if (configured.some((s) => s === 'ARCHIVED' || s === 'DELETED')) {
    planStatus = 'archived'
  } else if (configured.every((s) => s === 'ACTIVE')) {
    planStatus = 'active'
  } else if (configured.some((s) => s === 'PAUSED') && plan.status === 'active') {
    planStatus = 'user_paused'
  }
  if (planStatus === plan.status) planStatus = null

  const budgetMinor = live.adSet.dailyBudgetMinor !== null && live.adSet.dailyBudgetMinor > 0 && live.adSet.dailyBudgetMinor !== plan.dailyBudgetMinor
    ? live.adSet.dailyBudgetMinor
    : null
  return { planStatus, budgetMinor, effectiveStatus: metaEffectiveHeadline(live), drift: planStatus !== null || budgetMinor !== null }
}

/** Compact, secret-free snapshot stored on the plan. */
export function toLiveSnapshot(live: MetaLiveState): Record<string, unknown> {
  return {
    campaign: live.campaign,
    adSet: live.adSet,
    ad: { status: live.ad.status, effectiveStatus: live.ad.effectiveStatus, reviewFeedback: live.ad.reviewFeedback },
    spend: live.spend,
    fetchedAt: live.fetchedAt,
  }
}

/* ----------------------------- shared write helper ----------------------------- */

export type MetaManageStep = 'preflight' | 'campaign' | 'adset' | 'ad' | 'verify'

export type MetaManageOutcome =
  | { ok: true; live: MetaLiveState | null; verified: boolean }
  | { ok: false; step: MetaManageStep; failure: MetaPublishFailure; unknown: boolean; live: MetaLiveState | null }

type WriteTarget = {
  step: 'campaign' | 'adset' | 'ad'
  id: string
  write: 'act.campaigns.update' | 'act.adsets.update' | 'act.ads.update'
  read: 'campaign.status' | 'adset.status' | 'ad.status'
}

function targetFor(step: 'campaign' | 'adset' | 'ad', ids: MetaManagedIds): WriteTarget {
  if (step === 'campaign') return { step, id: ids.campaignId, write: 'act.campaigns.update', read: 'campaign.status' }
  if (step === 'adset') return { step, id: ids.adSetId, write: 'act.adsets.update', read: 'adset.status' }
  return { step, id: ids.adId, write: 'act.ads.update', read: 'ad.status' }
}

function failureFor(error: unknown, step: MetaPublishStep): MetaPublishFailure {
  return describeMetaPublishError(error, step)
}

type WriteResult = { ok: true } | { ok: false; error: unknown; unknown: boolean }

/**
 * One write, no retry. When the answer is lost (write_outcome_unknown / transport error) the object is read back:
 * a matching value counts as success, a different value as a definite failure, an unreadable one stays unknown.
 */
async function writeAndConfirm(
  input: Common,
  target: WriteTarget,
  form: Record<string, string>,
  matches: (record: Record<string, unknown>) => boolean,
  readFields: string,
): Promise<WriteResult> {
  try {
    await input.graph.request({
      endpoint: target.write,
      path: `/${target.id}`,
      method: 'POST',
      accessToken: input.accessToken,
      form,
      context: input.context,
    })
    return { ok: true }
  } catch (error) {
    const ambiguous = isMetaAdsError(error) && (error.code === 'write_outcome_unknown' || error.code === 'provider_unavailable')
    if (!ambiguous) return { ok: false, error, unknown: false }
    try {
      const record = asRecord(await input.graph.request({
        endpoint: target.read,
        path: `/${target.id}`,
        accessToken: input.accessToken,
        query: { fields: readFields },
        context: input.context,
      }))
      return matches(record) ? { ok: true } : { ok: false, error, unknown: false }
    } catch {
      return { ok: false, error: new MetaAdsError('write_outcome_unknown'), unknown: true }
    }
  }
}

async function tryReadLive(input: Common & { ids: MetaManagedIds }): Promise<MetaLiveState | null> {
  try {
    return await readMetaLiveState({ ...input, includeSpend: false })
  } catch {
    return null
  }
}

/* ----------------------------- activate ----------------------------- */

const ACTIVATION_BLOCKING_AD_STATES = new Set(['DISAPPROVED', 'WITH_ISSUES'])

function blocked(message: string, code: MetaPublishFailure['code'] = 'activation_blocked'): MetaPublishFailure {
  return { code, message, metaReason: null, blamedFields: [] }
}

/** Everything that must hold before the first spend-capable write; reads only. */
export async function preflightMetaActivation(
  input: Common & { ids: MetaManagedIds; planCurrency: string },
): Promise<{ ok: true; live: MetaLiveState } | { ok: false; failure: MetaPublishFailure; live: MetaLiveState | null }> {
  const account = await preflightMetaAccount(input)
  if (!account.ok) {
    const failure = account.failure.code === 'payment_method_missing'
      ? { ...account.failure, code: 'payment_required' as const }
      : account.failure
    return { ok: false, failure, live: null }
  }
  if (account.currency && account.currency.toUpperCase() !== input.planCurrency.toUpperCase()) {
    return { ok: false, failure: blocked('Reklam hesabının para birimi plandakinden farklı görünüyor. Planı yeniden oluşturun.'), live: null }
  }

  let live: MetaLiveState
  try {
    live = await readMetaLiveState({ ...input, includeSpend: false })
  } catch (error) {
    return { ok: false, failure: failureFor(error, 'preflight'), live: null }
  }
  if ([live.campaign.status, live.adSet.status, live.ad.status].some((s) => s === 'ARCHIVED' || s === 'DELETED')) {
    return { ok: false, failure: blocked('Kampanya Meta tarafında arşivlenmiş veya silinmiş; yeniden etkinleştirilemez.'), live }
  }
  if (live.ad.effectiveStatus && ACTIVATION_BLOCKING_AD_STATES.has(live.ad.effectiveStatus)) {
    return {
      ok: false,
      live,
      failure: {
        ...blocked(
          live.ad.reviewFeedback
            ? `Meta reklamı onaylamadı: ${live.ad.reviewFeedback}`
            : 'Meta reklamı onaylamadı. Meta Reklam Yöneticisi\'nde ayrıntıyı inceleyip reklamı düzeltin.',
          'ad_disapproved',
        ),
        metaReason: live.ad.reviewFeedback,
      },
    }
  }
  return { ok: true, live }
}

/** Campaign, then ad set, then ad. Objects already ACTIVE are skipped so a retry never repeats a write. */
export async function activateMetaPlan(input: Common & { ids: MetaManagedIds; planCurrency: string }): Promise<MetaManageOutcome> {
  const pre = await preflightMetaActivation(input)
  if (!pre.ok) return { ok: false, step: 'preflight', failure: pre.failure, unknown: false, live: pre.live }

  const current: Record<'campaign' | 'adset' | 'ad', string | null> = {
    campaign: pre.live.campaign.status,
    adset: pre.live.adSet.status,
    ad: pre.live.ad.status,
  }
  for (const step of ['campaign', 'adset', 'ad'] as const) {
    if (current[step] === 'ACTIVE') continue
    const result = await writeAndConfirm(
      input,
      targetFor(step, input.ids),
      { status: 'ACTIVE' },
      (record) => record.status === 'ACTIVE',
      'id,status,effective_status',
    )
    if (!result.ok) {
      return { ok: false, step, failure: failureFor(result.error, step), unknown: result.unknown, live: await tryReadLive(input) }
    }
  }
  const live = await tryReadLive(input)
  return { ok: true, live, verified: live !== null && live.campaign.status === 'ACTIVE' && live.adSet.status === 'ACTIVE' && live.ad.status === 'ACTIVE' }
}

/* ----------------------------- pause ----------------------------- */

/** Pausing the campaign stops all spend; ad set and ad are left as they are so resuming is a single step. */
export async function pauseMetaPlan(input: Common & { ids: MetaManagedIds }): Promise<MetaManageOutcome> {
  const result = await writeAndConfirm(
    input,
    targetFor('campaign', input.ids),
    { status: 'PAUSED' },
    (record) => record.status === 'PAUSED',
    'id,status,effective_status',
  )
  if (!result.ok) {
    return { ok: false, step: 'campaign', failure: failureFor(result.error, 'campaign'), unknown: result.unknown, live: await tryReadLive(input) }
  }
  const live = await tryReadLive(input)
  return { ok: true, live, verified: live !== null && live.campaign.status === 'PAUSED' }
}

/* ----------------------------- budget ----------------------------- */

export async function updateMetaBudget(input: Common & { ids: MetaManagedIds; dailyBudgetMinor: number }): Promise<MetaManageOutcome> {
  const wanted = String(input.dailyBudgetMinor)
  const result = await writeAndConfirm(
    input,
    targetFor('adset', input.ids),
    { daily_budget: wanted },
    (record) => String(record.daily_budget ?? '') === wanted,
    'id,daily_budget',
  )
  if (!result.ok) {
    return { ok: false, step: 'adset', failure: failureFor(result.error, 'adset'), unknown: result.unknown, live: await tryReadLive(input) }
  }
  const live = await tryReadLive(input)
  return { ok: true, live, verified: live !== null && live.adSet.dailyBudgetMinor === input.dailyBudgetMinor }
}
