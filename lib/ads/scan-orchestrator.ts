import type { z } from 'zod'
import type { AiModelSelection } from '@/lib/ai-models'
import { ADS_CREDIT_COSTS, assertAdsRequestId } from '@/lib/ads/credit-costs'
import { normalizeSiteAddress } from '@/lib/ads/normalize-site-address'
import { evaluateSnapshotPolicy, type PolicyCategory } from '@/lib/ads/policy'
import { POLICY_CATEGORIES } from '@/lib/ads/policy-terms'
import { suggestBudget, type BudgetSuggestion } from '@/lib/ads/budget'
import { estimateCostMicroUsd } from '@/lib/ads/model-pricing'
import {
  buildPlannerPrompt,
  newBoundaryToken,
  plannerOutputSchema,
  PLANNER_SYSTEM,
  validatePlan,
  type AdsPlan,
} from '@/lib/ads/planner'
import {
  AD_COPY_SYSTEM,
  adCopyIsSufficient,
  adCopyOutputSchema,
  buildAdCopyPrompt,
  validateAdCopy,
  type AdCopy,
} from '@/lib/ads/ad-copy'
import type { AdsScanError } from '@/lib/ads/public-errors'
import type { AdsChargeResult, AdsRefundResult } from '@/lib/ads/credits'
import { POLICY_BLOCKED_GLOBAL_SUBJECT, type AdsFreeReservation, type AdsFreeSubjects } from '@/lib/ads/free-quota'
import { halfCapThreshold } from '@/lib/ads/admin-alert'
import type { AdsUsageRow } from '@/lib/ads/usage-events'
import type { ScanSiteResult, SiteSnapshot } from '@/lib/ads/scan/scan-site'

/**
 * One scan request, end to end: validate, rate-limit, reserve the free action
 * (or charge credits), read the site, run the policy gate, ask the model for a
 * plan and ad text, validate everything in code, and give back exactly what was
 * taken when the request fails before the model produced a usable result.
 *
 * Every side effect goes through `ScanDeps`, so the whole money path is tested
 * with fakes.
 */

export type ScanActor =
  | { kind: 'user'; userId: string; planCode: string | null; ip: string }
  | { kind: 'anon'; anonId: string; ip: string }

export type ScanRequest = { address: string; requestId: string; actor: ScanActor }

export type PublicScanResult = {
  host: string
  mode: 'free' | 'paid'
  plan: {
    brand: string
    sector: string
    sectorLabel: string
    services: string[]
    language: 'tr' | 'en'
    languageFallback: boolean
    country: string
    cities: string[]
    keywords: string[]
    negativeKeywords: string[]
  }
  ad: { headlines: string[]; descriptions: string[]; displayUrl: string }
  budget: BudgetSuggestion
  restricted: PolicyCategory[]
}

export type ScanOutcome = { ok: true; result: PublicScanResult } | { ok: false; error: AdsScanError }

type Usage = { inputTokens: number; outputTokens: number }

export type ScanGenerate = <T>(args: {
  ai: AiModelSelection
  schema: z.ZodType<T>
  system: string
  prompt: string
  abortSignal: AbortSignal
}) => Promise<{ object: T; usage: Usage }>

export type ScanDeps = {
  now: () => number
  rateLimit: (key: string, limit: number, windowMs: number) => { allowed: boolean; retryAfterMs: number }
  subjectsFor: (actor: ScanActor) => AdsFreeSubjects | null
  reserveFree: (requestId: string, subjects: AdsFreeSubjects) => Promise<AdsFreeReservation>
  releaseFree: (requestId: string) => Promise<boolean>
  policySubjectsFor: (actor: ScanActor) => AdsFreeSubjects | null
  reservePolicyBlocked: (requestId: string, subjects: AdsFreeSubjects) => Promise<AdsFreeReservation>
  releasePolicyBlocked: (requestId: string, subjects: AdsFreeSubjects) => Promise<boolean>
  policyBlockedDailyCap: () => number
  charge: (userId: string, requestId: string) => Promise<AdsChargeResult>
  refund: (userId: string, requestId: string) => Promise<AdsRefundResult>
  scanSite: (address: string) => Promise<ScanSiteResult>
  resolveModel: (flow: 'adsPlanner' | 'adsPreview', planCode: string | null) => AiModelSelection
  generate: ScanGenerate
  writeUsage: (row: AdsUsageRow) => Promise<void>
  anonCap: () => number
  readGlobalAnonUsed: () => Promise<number | null>
  notifyAnonCap: (level: 'half' | 'full', cap: number) => Promise<void>
  readGlobalPolicyBlockedUsed: () => Promise<number | null>
  notifyPolicyBlockedCap: (cap: number) => Promise<void>
}

export const SCAN_TOTAL_BUDGET_MS = 110_000
const SAFETY_MARGIN_MS = 5_000
const PLANNER_MAX_MS = 60_000
const PREVIEW_MAX_MS = 30_000
const MIN_AI_WINDOW_MS = 8_000
const MIN_RETRY_WINDOW_MS = 15_000
export const RATE_LIMITS = {
  perActorPerMinute: 6,
  perHostPer10Minutes: 5,
} as const

const SEVERITY = new Map<PolicyCategory, 'blocked' | 'restricted'>(
  POLICY_CATEGORIES.map((c) => [c.category, c.severity]),
)

function fail(error: AdsScanError): ScanOutcome {
  return { ok: false, error }
}

function actorKey(actor: ScanActor): string {
  return actor.kind === 'user' ? `user:${actor.userId}` : `ip:${actor.ip}`
}

class StageTimeout extends Error {}

export async function runScan(request: ScanRequest, deps: ScanDeps): Promise<ScanOutcome> {
  const startedAt = deps.now()
  const { actor, requestId } = request

  try {
    assertAdsRequestId(requestId)
  } catch {
    return fail({ code: 'invalid_request' })
  }
  const normalized = normalizeSiteAddress(request.address)
  if (!normalized.ok) return fail({ code: 'invalid_request' })

  const byActor = deps.rateLimit(`ads-scan:actor:${actorKey(actor)}`, RATE_LIMITS.perActorPerMinute, 60_000)
  if (!byActor.allowed) {
    return fail({ code: 'rate_limited', retryAfterSeconds: Math.max(1, Math.ceil(byActor.retryAfterMs / 1000)) })
  }
  const byHost = deps.rateLimit(`ads-scan:host:${normalized.host}`, RATE_LIMITS.perHostPer10Minutes, 600_000)
  if (!byHost.allowed) {
    return fail({ code: 'rate_limited', retryAfterSeconds: Math.max(1, Math.ceil(byHost.retryAfterMs / 1000)) })
  }

  const subjects = deps.subjectsFor(actor)
  if (!subjects) return fail({ code: 'service_unavailable' })

  // ---- quota / credit ownership ------------------------------------------------
  let mode: 'free' | 'paid'
  let ownsFree = false
  let ownsCharge = false
  let ownsPolicyReservation = false
  let policyReservationSubjects: AdsFreeSubjects | null = null
  let keepPolicyReservation = false
  let kept = false // true only when the scan action succeeds

  const reservation = await deps.reserveFree(requestId, subjects)
  if (reservation.allowed) {
    if (reservation.alreadyReserved) return fail({ code: 'duplicate' })
    mode = 'free'
    ownsFree = true
    if (actor.kind === 'anon') await notifyCapLevels(deps)
  } else if (reservation.reason === 'quota_unavailable') {
    return fail({ code: 'service_unavailable' })
  } else if (actor.kind === 'user') {
    mode = 'paid'
  } else if (reservation.blockedSubject === 'ads:global:anon') {
    await deps.notifyAnonCap('full', deps.anonCap())
    return fail({ code: 'anon_capacity' })
  } else {
    return fail({ code: 'login_required' })
  }

  const userId = actor.kind === 'user' ? actor.userId : null
  const planCode = actor.kind === 'user' ? actor.planCode : null
  const anonHash = actor.kind === 'anon' ? subjects.anonSubjectHash : null

  let finalCode: string | null = null
  let creditRefunded = false
  let chargedAmount = 0
  const aiRows: AdsUsageRow[] = []

  const baseRow = (flow: AdsUsageRow['flow'], model: string): AdsUsageRow => ({
    user_id: userId,
    anon_subject_hash: anonHash,
    flow,
    model,
    input_tokens: null,
    output_tokens: null,
    est_cost_micro_usd: null,
    credits_charged: 0,
    free_quota_used: false,
    outcome: 'ok',
    error_code: null,
    duration_ms: null,
    request_id: requestId,
  })

  const record = async (
    flow: 'plan' | 'preview',
    selection: AiModelSelection,
    usage: Usage,
    durationMs: number,
    errorCode: string | null,
  ) => {
    aiRows.push({
      ...baseRow(flow, selection.model),
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      est_cost_micro_usd: estimateCostMicroUsd(selection.model, usage),
      outcome: errorCode ? 'error' : 'ok',
      error_code: errorCode,
      duration_ms: durationMs,
    })
  }

  const remaining = () => SCAN_TOTAL_BUDGET_MS - (deps.now() - startedAt) - SAFETY_MARGIN_MS

  /** Runs one model call within the time left; throws StageTimeout when there is none. */
  async function ask<T>(
    flow: 'plan' | 'preview',
    selection: AiModelSelection,
    schema: z.ZodType<T>,
    system: string,
    prompt: string,
    maxMs: number,
  ): Promise<T> {
    const budgetMs = Math.min(maxMs, remaining())
    if (budgetMs < MIN_AI_WINDOW_MS) throw new StageTimeout()
    const signal = AbortSignal.timeout(budgetMs)
    const t0 = deps.now()
    try {
      const { object, usage } = await deps.generate({ ai: selection, schema, system, prompt, abortSignal: signal })
      await record(flow, selection, usage, deps.now() - t0, null)
      return object
    } catch (error) {
      const usage = (error as { usage?: Usage } | null)?.usage ?? { inputTokens: 0, outputTokens: 0 }
      const timedOut = signal.aborted
      await record(flow, selection, usage, deps.now() - t0, timedOut ? 'timeout' : 'generation_failed')
      if (timedOut) throw new StageTimeout()
      throw error
    }
  }

  try {
    // ---- read the site ---------------------------------------------------------
    const scan = await deps.scanSite(normalized.url)
    if (!scan.ok) {
      finalCode = scan.code
      return fail({ code: scan.code === 'invalid_address' ? 'invalid_request' : scan.code })
    }
    const snapshot: SiteSnapshot = scan.snapshot

    // ---- policy before any model call -------------------------------------------
    const pre = evaluateSnapshotPolicy(snapshot)
    if (pre.verdict === 'blocked') {
      finalCode = 'policy_blocked'
      return fail({ code: 'policy_blocked', consumed: false, blockedCategories: pre.blocked })
    }
    const restricted = new Set<PolicyCategory>(pre.restricted)

    // Reserve one separate attempt before any AI call. It is kept only if the model confirms a block.
    const policySubjects = deps.policySubjectsFor(actor)
    if (!policySubjects) {
      finalCode = 'service_unavailable'
      return fail({ code: 'service_unavailable' })
    }
    policyReservationSubjects = policySubjects
    let policyReservation: AdsFreeReservation
    try {
      policyReservation = await deps.reservePolicyBlocked(requestId, policySubjects)
    } catch {
      finalCode = 'service_unavailable'
      return fail({ code: 'service_unavailable' })
    }
    if (policyReservation.allowed) {
      if (policyReservation.alreadyReserved) {
        finalCode = 'duplicate'
        return fail({ code: 'duplicate' })
      }
      ownsPolicyReservation = true
    } else if (policyReservation.reason === 'quota_unavailable') {
      finalCode = 'service_unavailable'
      return fail({ code: 'service_unavailable' })
    } else {
      finalCode = 'policy_limit'
      if (policyReservation.blockedSubject === POLICY_BLOCKED_GLOBAL_SUBJECT) {
        try {
          await deps.notifyPolicyBlockedCap(deps.policyBlockedDailyCap())
        } catch {
          // Alerting must never change the scan outcome.
        }
      }
      return fail({ code: 'policy_limit' })
    }

    // ---- credits (paid mode only, after the cheap checks) -------------------------
    if (mode === 'paid' && userId) {
      const charged = await deps.charge(userId, requestId)
      if (!charged.ok) {
        if (charged.reason === 'insufficient_credits') {
          finalCode = 'credits_required'
          return fail({ code: 'credits_required', balance: charged.balance })
        }
        finalCode = 'service_unavailable'
        return fail({ code: 'service_unavailable' })
      }
      if (charged.alreadyCharged) {
        // Another run (or a refunded earlier one) owns this id: never run the model for free.
        finalCode = 'duplicate'
        return fail({ code: 'duplicate' })
      }
      ownsCharge = true
      chargedAmount = charged.chargedAmount || ADS_CREDIT_COSTS.scanAndPreview
    }

    // ---- stage 1: plan ------------------------------------------------------------
    const plannerModel = deps.resolveModel('adsPlanner', planCode)
    let plan: AdsPlan | null
    try {
      const raw = await ask('plan', plannerModel, plannerOutputSchema, PLANNER_SYSTEM, buildPlannerPrompt(snapshot, newBoundaryToken()), PLANNER_MAX_MS)
      plan = validatePlan(raw, snapshot)
    } catch (error) {
      return failAi(error)
    }
    if (!plan) {
      finalCode = 'generation_failed'
      return fail({ code: 'generation_failed' })
    }

    // The model may only tighten the policy, never loosen it.
    if (plan.modelPolicyCategory) {
      if (SEVERITY.get(plan.modelPolicyCategory) === 'blocked') {
        keepPolicyReservation = true
        finalCode = 'policy_blocked'
        await notifyPolicyCapIfReached(deps)
        return fail({ code: 'policy_blocked', consumed: true, blockedCategories: [plan.modelPolicyCategory] })
      }
      restricted.add(plan.modelPolicyCategory)
    }

    // ---- stage 2: ad text -----------------------------------------------------------
    const previewModel = deps.resolveModel('adsPreview', planCode)
    let copy: AdCopy | null = null
    try {
      for (let attempt = 0; attempt < 2 && !copy; attempt++) {
        if (attempt === 1 && remaining() < MIN_RETRY_WINDOW_MS) break
        const raw = await ask('preview', previewModel, adCopyOutputSchema, AD_COPY_SYSTEM, buildAdCopyPrompt(plan), PREVIEW_MAX_MS)
        const candidate = validateAdCopy(raw, plan, snapshot)
        if (adCopyIsSufficient(candidate)) copy = candidate
      }
    } catch (error) {
      return failAi(error)
    }
    if (!copy) {
      finalCode = 'generation_failed'
      return fail({ code: 'generation_failed' })
    }

    kept = true
    return {
      ok: true,
      result: {
        host: snapshot.finalHost,
        mode,
        plan: {
          brand: plan.brand,
          sector: plan.sector,
          sectorLabel: plan.sectorLabel,
          services: plan.services,
          language: plan.language,
          languageFallback: plan.languageFallback,
          country: plan.country,
          cities: plan.cities,
          keywords: plan.keywords,
          negativeKeywords: plan.negativeKeywords,
        },
        ad: { headlines: copy.headlines, descriptions: copy.descriptions, displayUrl: copy.displayUrl },
        budget: suggestBudget(plan.competitiveness),
        restricted: [...restricted],
      },
    }
  } finally {
    // Policy slots count only when the model confirms a blocked category.
    if (ownsPolicyReservation && !keepPolicyReservation && policyReservationSubjects) {
      try {
        await deps.releasePolicyBlocked(requestId, policyReservationSubjects)
      } catch {
        // A quota cleanup failure must not skip scan-credit refunds.
      }
    }
    // One place gives back whatever this request took and did not use.
    if (!kept) {
      if (ownsFree) await deps.releaseFree(requestId)
      if (ownsCharge && userId) {
        const refund = await deps.refund(userId, requestId)
        creditRefunded = refund.refunded
      }
    }
    const succeeded = kept && finalCode === null
    const keptCharge = kept ? chargedAmount : 0
    const row: AdsUsageRow = {
      ...baseRow('scan', 'none'),
      credits_charged: keptCharge,
      free_quota_used: kept && ownsFree,
      outcome: succeeded ? 'ok' : creditRefunded ? 'refunded' : 'error',
      error_code: succeeded ? null : finalCode ?? 'unknown',
      duration_ms: deps.now() - startedAt,
    }
    if (finalCode !== 'duplicate') {
      for (const aiRow of mergeByFlow(aiRows)) await deps.writeUsage(aiRow)
      await deps.writeUsage(row)
    }
  }

  function failAi(error: unknown): ScanOutcome {
    if (error instanceof StageTimeout) {
      finalCode = 'timeout'
      return fail({ code: 'timeout' })
    }
    finalCode = 'generation_failed'
    return fail({ code: 'generation_failed' })
  }
}

/** The unique index is per (request id, flow): a second preview attempt is summed into the first row. */
function mergeByFlow(rows: AdsUsageRow[]): AdsUsageRow[] {
  const merged = new Map<string, AdsUsageRow>()
  for (const row of rows) {
    const existing = merged.get(row.flow)
    if (!existing) {
      merged.set(row.flow, { ...row })
      continue
    }
    existing.input_tokens = (existing.input_tokens ?? 0) + (row.input_tokens ?? 0)
    existing.output_tokens = (existing.output_tokens ?? 0) + (row.output_tokens ?? 0)
    existing.est_cost_micro_usd =
      existing.est_cost_micro_usd === null && row.est_cost_micro_usd === null
        ? null
        : (existing.est_cost_micro_usd ?? 0) + (row.est_cost_micro_usd ?? 0)
    existing.duration_ms = (existing.duration_ms ?? 0) + (row.duration_ms ?? 0)
    existing.outcome = row.outcome
    existing.error_code = row.error_code
  }
  return [...merged.values()]
}

async function notifyPolicyCapIfReached(deps: ScanDeps): Promise<void> {
  try {
    const cap = deps.policyBlockedDailyCap()
    const used = await deps.readGlobalPolicyBlockedUsed()
    if (used !== null && used >= cap) await deps.notifyPolicyBlockedCap(cap)
  } catch {
    // Alerting must never change the scan outcome.
  }
}

/** Warns the admin at 50 % and 100 % of the anonymous daily ceiling (once per day each, enforced in the database). */
async function notifyCapLevels(deps: ScanDeps): Promise<void> {
  const cap = deps.anonCap()
  const used = await deps.readGlobalAnonUsed()
  if (used === null) return
  if (used >= cap) await deps.notifyAnonCap('full', cap)
  else if (used >= halfCapThreshold(cap)) await deps.notifyAnonCap('half', cap)
}
