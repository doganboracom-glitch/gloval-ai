import { addCalendarMonths } from '@/lib/billing-utils'
import { AI_CREDIT_CONFIG, toPlanCode } from '@/lib/pricing-config'

/**
 * Daily "plan credit sweep": gives paid subscribers the AI credits their plan
 * promises (first period, monthly top-up, rollover, balance ceiling) through the
 * `grant_plan_period_credits` Postgres function.
 *
 * Pure orchestration with injected I/O so it can be tested without a database.
 * The Supabase-backed store and the env-driven entry point live in
 * `plan-credit-sweep-store.ts`. Nothing here touches payment code, and nothing
 * here logs e-mails, names or any other personal data: only subscription ids
 * and amounts.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_REPORTED_ERRORS = 50
/** Calendar-month arithmetic and billing period ends can differ by a few hours. */
const PERIOD_END_TOLERANCE_MS = DAY_MS

export type CreditPlanCode = 'starter' | 'pro' | 'ecommerce'
export type CreditCycle = 'monthly' | 'yearly'

/** What a paid plan earns, read from `AI_CREDIT_CONFIG` (no numbers live here). */
export type GrantRule = {
  planCode: CreditPlanCode
  firstCredits: number
  periodCredits: number
  /** Ceiling of the TOTAL balance (never of the per-period amount); null = none. */
  maxBalance: number | null
  /** Non-rollover plans lose the unused part of the previous grant. */
  expireUnused: boolean
}

export function resolveGrantRule(planCode: CreditPlanCode): GrantRule {
  switch (planCode) {
    case 'starter':
      return {
        planCode,
        firstCredits: AI_CREDIT_CONFIG.starter.credits,
        periodCredits: AI_CREDIT_CONFIG.starter.credits,
        maxBalance: null,
        expireUnused: !AI_CREDIT_CONFIG.starter.rollover,
      }
    case 'pro':
      return {
        planCode,
        firstCredits: AI_CREDIT_CONFIG.pro.initialCredits,
        periodCredits: AI_CREDIT_CONFIG.pro.monthlyCredits,
        maxBalance: AI_CREDIT_CONFIG.pro.maxBalance,
        expireUnused: !AI_CREDIT_CONFIG.pro.rollover,
      }
    case 'ecommerce':
      return {
        planCode,
        firstCredits: AI_CREDIT_CONFIG.ecommerce.initialCredits,
        periodCredits: AI_CREDIT_CONFIG.ecommerce.monthlyCredits,
        maxBalance: AI_CREDIT_CONFIG.ecommerce.maxBalance,
        expireUnused: !AI_CREDIT_CONFIG.ecommerce.rollover,
      }
  }
}

/**
 * Credit period (not billing period) a paid subscription is in right now.
 *
 * Credits are monthly whatever the billing cycle: a yearly payment simply holds
 * 12 monthly windows. Windows start at the paid period start and
 *  - STARTER: step 30 days (`creditPeriodDays`);
 *  - PRO / E-COMMERCE: step one calendar month.
 * The number of windows inside the paid period is fixed, and the last window is
 * stretched to the period end, so a monthly STARTER payment (28-31 days) holds
 * exactly one window and a yearly one exactly twelve. Returns null when the
 * paid period has not started or has already ended (an unpaid period earns
 * nothing); credits missed in the past are not back-filled.
 */
export function resolveCreditPeriod(
  planCode: CreditPlanCode,
  periodStart: Date,
  periodEnd: Date | null,
  now: Date,
): { index: number; start: Date } | null {
  const nowMs = now.getTime()
  if (Number.isNaN(periodStart.getTime()) || nowMs < periodStart.getTime()) return null
  if (periodEnd && nowMs >= periodEnd.getTime()) return null

  if (planCode === 'starter') {
    const step = AI_CREDIT_CONFIG.starter.creditPeriodDays * DAY_MS
    const count = periodEnd ? Math.max(1, Math.floor((periodEnd.getTime() - periodStart.getTime()) / step)) : Infinity
    const index = Math.min(Math.floor((nowMs - periodStart.getTime()) / step), count - 1)
    return { index, start: new Date(periodStart.getTime() + index * step) }
  }

  let count = Infinity
  if (periodEnd) {
    count = 0
    const limit = periodEnd.getTime() + PERIOD_END_TOLERANCE_MS
    while (count < 600 && addCalendarMonths(periodStart, count + 1).getTime() <= limit) count += 1
    count = Math.max(1, count)
  }
  let index = 0
  while (index + 1 < count && index < 600 && addCalendarMonths(periodStart, index + 1).getTime() <= nowMs) index += 1
  return { index, start: index === 0 ? periodStart : addCalendarMonths(periodStart, index) }
}

/** Ledger `reason` written by the SQL function for one subscription period. */
export function planGrantReason(subscriptionId: string, periodStart: Date): string {
  return `plan_grant:${subscriptionId}:${periodStart.toISOString()}`
}

/* ------------------------- dry-run preview (pure) ------------------------- */

export type LedgerEntry = { kind: string; amount: number; reason: string | null; created_at: string }

export type GrantPreview = {
  duplicate: boolean
  firstPeriod: boolean
  expired: number
  granted: number
}

/**
 * Mirror of `grant_plan_period_credits` over a user's ledger, used to report
 * what a real run WOULD write while writing nothing. Same order of steps:
 * idempotency check, first-period detection, expiry of the unused previous
 * grant (non-rollover plans), then the balance ceiling.
 */
export function previewPlanGrant(ledger: readonly LedgerEntry[], rule: GrantRule, subscriptionId: string, periodStart: Date): GrantPreview {
  const key = planGrantReason(subscriptionId, periodStart)
  if (ledger.some((row) => row.reason === key)) return { duplicate: true, firstPeriod: false, expired: 0, granted: 0 }

  const prefix = `plan_grant:${subscriptionId}:`
  const priorGrants = ledger.filter((row) => row.kind === 'package' && row.reason?.startsWith(prefix))
  const firstPeriod = !ledger.some((row) => row.reason?.startsWith(prefix))
  let balance = ledger.reduce((sum, row) => sum + row.amount, 0)

  let expired = 0
  if (rule.expireUnused && !firstPeriod && priorGrants.length > 0) {
    const last = [...priorGrants].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    const spent = ledger
      .filter((row) => row.kind === 'usage' && row.created_at >= last.created_at)
      .reduce((sum, row) => sum - row.amount, 0)
    expired = Math.max(0, Math.min(last.amount - spent, balance))
    balance -= expired
  }

  const base = firstPeriod ? rule.firstCredits : rule.periodCredits
  const granted = rule.maxBalance === null ? base : Math.min(base, Math.max(0, rule.maxBalance - balance))
  return { duplicate: false, firstPeriod, expired, granted }
}

/* --------------------------------- sweep ---------------------------------- */

export type PlanCreditSubscription = {
  id: string
  userId: string
  status: string
  /** `billing_plans.code` */
  planCode: string | null
  /** `billing_plans.product_category`; add-ons are never plan credits. */
  productCategory: string | null
  /** `billing_plans.interval` */
  interval: string | null
  periodStart: string | null
  periodEnd: string | null
}

export type GrantResult = { granted: number; expired: number; balance: number; duplicate: boolean; firstPeriod: boolean }

export interface PlanCreditStore {
  /** Keyset page (ascending id) of ACTIVE paid-or-free subscriptions. */
  listPage(afterId: string | null, limit: number): Promise<PlanCreditSubscription[]>
  /** Which of these ledger reasons already exist (one query per page). */
  findGrantedReasons(reasons: string[]): Promise<Set<string>>
  /** Ledger rows of one user; only used to compute the dry-run preview. */
  loadLedger(userId: string): Promise<LedgerEntry[]>
  /** The RPC. Idempotent per (subscription, period). */
  grant(args: { userId: string; subscriptionId: string; periodRef: string; rule: GrantRule }): Promise<GrantResult>
}

export type PlanCreditEntry = {
  subscriptionId: string
  plan: CreditPlanCode
  cycle: CreditCycle
  periodStart: string
  amount: number
  firstPeriod: boolean
}

export type PlanCreditSweepSummary = {
  dryRun: boolean
  scanned: number
  wouldGrant: PlanCreditEntry[]
  granted: PlanCreditEntry[]
  alreadyGranted: number
  skipped: { inactive: number; notCreditPlan: number; noPaidPeriod: number }
  errors: Array<{ subscriptionId: string; code: string }>
  errorCount: number
  truncated: boolean
}

export type PlanCreditSweepOptions = {
  store: PlanCreditStore
  now?: Date
  /** When true nothing is written; the summary lists what would be granted. */
  dryRun: boolean
  /** Stop early once this timestamp (ms) has passed. */
  deadlineMs?: number
  pageSize?: number
  maxSubscriptions?: number
}

export type PlanCreditCandidate = {
  sub: PlanCreditSubscription
  rule: GrantRule
  cycle: CreditCycle
  start: Date
  reason: string
}

export type PlanCreditSkipReason = keyof PlanCreditSweepSummary['skipped']

/**
 * Decides whether ONE subscription earns plan credits right now and for which
 * credit period. Shared by the daily sweep and the instant grant after a
 * payment, so both always agree on who is eligible.
 */
export function classifyPlanCreditSubscription(
  sub: PlanCreditSubscription,
  now: Date,
): { candidate: PlanCreditCandidate } | { skip: PlanCreditSkipReason } {
  if (sub.status !== 'active') return { skip: 'inactive' }
  // `toPlanCode` matches substrings ("extra_product_100" contains "pro"), so
  // add-ons must be excluded by category before the code is interpreted.
  const mapped = sub.productCategory === 'addon' ? 'free' : toPlanCode(sub.planCode)
  if (mapped === 'free') return { skip: 'notCreditPlan' }
  const periodStart = sub.periodStart ? new Date(sub.periodStart) : null
  const period = periodStart
    ? resolveCreditPeriod(mapped, periodStart, sub.periodEnd ? new Date(sub.periodEnd) : null, now)
    : null
  if (!period) return { skip: 'noPaidPeriod' }
  return {
    candidate: {
      sub,
      rule: resolveGrantRule(mapped),
      cycle: sub.interval === 'year' ? 'yearly' : 'monthly',
      start: period.start,
      reason: planGrantReason(sub.id, period.start),
    },
  }
}

export type PlanCreditGrantOutcome =
  | { kind: 'already_granted' }
  | { kind: 'would_grant'; entry: PlanCreditEntry }
  | { kind: 'granted'; entry: PlanCreditEntry; result: GrantResult }

/**
 * Grants (or, in dry-run, previews) the credits of ONE eligible candidate.
 * Idempotent per (subscription, period): the RPC and the preview both report a
 * duplicate instead of writing twice. Throws on store errors; callers decide
 * how to isolate them.
 */
export async function grantPlanCreditCandidate(
  store: PlanCreditStore,
  candidate: PlanCreditCandidate,
  dryRun: boolean,
): Promise<PlanCreditGrantOutcome> {
  const { sub, rule, cycle, start } = candidate
  const entry = (amount: number, firstPeriod: boolean): PlanCreditEntry => ({
    subscriptionId: sub.id,
    plan: rule.planCode,
    cycle,
    periodStart: start.toISOString(),
    amount,
    firstPeriod,
  })
  if (dryRun) {
    const preview = previewPlanGrant(await store.loadLedger(sub.userId), rule, sub.id, start)
    return preview.duplicate
      ? { kind: 'already_granted' }
      : { kind: 'would_grant', entry: entry(preview.granted, preview.firstPeriod) }
  }
  const result = await store.grant({ userId: sub.userId, subscriptionId: sub.id, periodRef: start.toISOString(), rule })
  if (result.duplicate) return { kind: 'already_granted' }
  return { kind: 'granted', entry: entry(result.granted, result.firstPeriod), result }
}

/** Dry-run unless the variable is exactly "false" (case-insensitive). */
export function isPlanCreditDryRun(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() !== 'false'
}

/**
 * Single-line, PII-free JSON log of a finished sweep: counts and amounts only
 * (no user ids, no subscription ids, no emails); errors are grouped by code.
 */
export function formatPlanCreditSweepLog(summary: PlanCreditSweepSummary): string {
  const sum = (entries: PlanCreditEntry[]) => entries.reduce((total, e) => total + e.amount, 0)
  const errors: Record<string, number> = {}
  for (const e of summary.errors) errors[e.code] = (errors[e.code] ?? 0) + 1
  return JSON.stringify({
    dryRun: summary.dryRun,
    scanned: summary.scanned,
    wouldGrant: summary.wouldGrant.length,
    wouldGrantAmount: sum(summary.wouldGrant),
    granted: summary.granted.length,
    grantedAmount: sum(summary.granted),
    alreadyGranted: summary.alreadyGranted,
    skipped: summary.skipped,
    errorCount: summary.errorCount,
    errors,
    truncated: summary.truncated,
  })
}

export async function sweepPlanCredits(options: PlanCreditSweepOptions): Promise<PlanCreditSweepSummary> {
  const summary = await runPlanCreditSweep(options)
  console.log('[plan-credit-sweep]', formatPlanCreditSweepLog(summary))
  return summary
}

async function runPlanCreditSweep(options: PlanCreditSweepOptions): Promise<PlanCreditSweepSummary> {
  const { store, dryRun, deadlineMs, pageSize = 100, maxSubscriptions = 2000 } = options
  const now = options.now ?? new Date()

  const summary: PlanCreditSweepSummary = {
    dryRun,
    scanned: 0,
    wouldGrant: [],
    granted: [],
    alreadyGranted: 0,
    skipped: { inactive: 0, notCreditPlan: 0, noPaidPeriod: 0 },
    errors: [],
    errorCount: 0,
    truncated: false,
  }

  const fail = (subscriptionId: string, code: string) => {
    summary.errorCount += 1
    if (summary.errors.length < MAX_REPORTED_ERRORS) summary.errors.push({ subscriptionId, code })
  }
  const limitReached = () =>
    summary.scanned >= maxSubscriptions || (deadlineMs !== undefined && Date.now() >= deadlineMs)

  const classify = (sub: PlanCreditSubscription): PlanCreditCandidate | null => {
    const result = classifyPlanCreditSubscription(sub, now)
    if ('skip' in result) {
      summary.skipped[result.skip] += 1
      return null
    }
    return result.candidate
  }

  let cursor: string | null = null
  for (;;) {
    const page = await store.listPage(cursor, pageSize)
    if (page.length === 0) break

    const candidates: PlanCreditCandidate[] = []
    for (const sub of page) {
      if (limitReached()) {
        summary.truncated = true
        return summary
      }
      summary.scanned += 1
      const candidate = classify(sub)
      if (candidate) candidates.push(candidate)
    }

    let existing = new Set<string>()
    if (candidates.length > 0) {
      try {
        existing = await store.findGrantedReasons(candidates.map((c) => c.reason))
      } catch {
        // Without the pre-check the RPC's own idempotency still protects the
        // ledger, so a failed lookup is reported and the page carries on.
        fail('page', 'idempotency_lookup_failed')
      }
    }

    for (const candidate of candidates) {
      if (limitReached()) {
        summary.truncated = true
        return summary
      }
      const { sub, reason } = candidate
      if (existing.has(reason)) {
        summary.alreadyGranted += 1
        continue
      }

      try {
        const outcome = await grantPlanCreditCandidate(store, candidate, dryRun)
        if (outcome.kind === 'already_granted') summary.alreadyGranted += 1
        else if (outcome.kind === 'would_grant') summary.wouldGrant.push(outcome.entry)
        else {
          summary.granted.push(outcome.entry)
          console.log(`[plan-credits] granted subscription=${sub.id} amount=${outcome.result.granted} expired=${outcome.result.expired}`)
        }
      } catch {
        fail(sub.id, dryRun ? 'preview_failed' : 'grant_failed')
      }
    }

    cursor = page[page.length - 1].id
    if (page.length < pageSize) break
  }
  return summary
}
