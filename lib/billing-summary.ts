import { AI_CREDIT_CONFIG, toPlanCode, type PlanCode } from '@/lib/pricing-config'
import { addCalendarMonths } from '@/lib/billing-utils'

/**
 * Pure builders for the billing screen's "Site kapasitesi" and "AI kredileri"
 * cards. Everything is derived on the server (effective site limit, project
 * rows, credit ledger rows); the client only renders the result.
 */

/* ------------------------------ Site capacity ----------------------------- */

export type SiteCapacity = {
  /** Effective publish capacity: (admin override ?? plan limit) + active add-ons. */
  total: number
  /** Published sites, the exact counter `publishProject` enforces the limit with. */
  used: number
  usedCorporate: number
  usedEcommerce: number
  remaining: number
  /** Separate e-commerce right; add-on sites do NOT raise it. */
  ecommerceLimit: number
  ecommerceUsed: number
}

export function buildSiteCapacity(input: {
  total: number
  ecommerceLimit: number
  projects: ReadonlyArray<{ published: boolean; project_type?: string | null }>
}): SiteCapacity {
  const published = input.projects.filter((p) => p.published)
  const usedEcommerce = published.filter((p) => p.project_type === 'ecommerce').length
  const used = published.length
  return {
    total: input.total,
    used,
    usedCorporate: used - usedEcommerce,
    usedEcommerce,
    remaining: Math.max(0, input.total - used),
    ecommerceLimit: input.ecommerceLimit,
    ecommerceUsed: usedEcommerce,
  }
}

/* ------------------------------- AI credits ------------------------------- */

export type CreditLedgerRow = { amount: number; created_at: string }

export type CreditSummary = {
  planCode: PlanCode
  /** Σ ledger amount (never a stored balance). */
  balance: number
  /** Positive ledger entries inside the current credit period. */
  grantedThisPeriod: number
  /** Consumed (negative) ledger entries inside the current credit period, as a positive number. */
  usedThisPeriod: number
  /** Plan rule: credits granted every period (null for the one-time FREE grant). */
  periodAllowance: number | null
  /** Plan rule: credits of the first period when it differs (e-commerce). */
  firstPeriodAllowance: number | null
  rollover: boolean
  /** Maximum accumulated balance, when the plan has one. */
  maxBalance: number | null
  periodStart: string | null
  /** Next credit renewal / period boundary; null when credits never renew. */
  nextRenewal: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Current credit window. FREE has a single one-time grant (no window).
 * STARTER renews every 30 days; PRO and E-COMMERCE renew on each monthly
 * anniversary of the subscription period start. The window never extends past
 * the paid period end.
 */
export function resolveCreditWindow(
  planCode: PlanCode,
  periodStart: Date | null,
  periodEnd: Date | null,
  now: Date,
): { start: Date | null; next: Date | null } {
  if (planCode === 'free' || !periodStart) return { start: null, next: null }

  let start = periodStart
  let next: Date
  if (planCode === 'starter') {
    const step = AI_CREDIT_CONFIG.starter.creditPeriodDays * DAY_MS
    const elapsed = Math.max(0, now.getTime() - periodStart.getTime())
    start = new Date(periodStart.getTime() + Math.floor(elapsed / step) * step)
    next = new Date(start.getTime() + step)
  } else {
    let months = 0
    while (addCalendarMonths(periodStart, months + 1).getTime() <= now.getTime() && months < 600) {
      months += 1
    }
    start = addCalendarMonths(periodStart, months)
    next = addCalendarMonths(periodStart, months + 1)
  }
  if (periodEnd && next.getTime() > periodEnd.getTime()) next = periodEnd
  return { start, next }
}

export function buildCreditSummary(input: {
  planCode: string | null | undefined
  ledger: readonly CreditLedgerRow[]
  periodStart: string | null
  periodEnd: string | null
  /** 'month' | 'year' billing cycle; only PRO's allowance depends on it. */
  interval?: 'month' | 'year' | 'once' | null
  now?: Date
}): CreditSummary {
  const planCode = toPlanCode(input.planCode)
  const now = input.now ?? new Date()
  const { start, next } = resolveCreditWindow(
    planCode,
    input.periodStart ? new Date(input.periodStart) : null,
    input.periodEnd ? new Date(input.periodEnd) : null,
    now,
  )

  let balance = 0
  let granted = 0
  let used = 0
  for (const row of input.ledger) {
    balance += row.amount
    // FREE has no window: its single grant and usage are all-time.
    if (start && new Date(row.created_at).getTime() < start.getTime()) continue
    if (row.amount > 0) granted += row.amount
    else used += -row.amount
  }

  let periodAllowance: number | null = null
  let firstPeriodAllowance: number | null = null
  let rollover = false
  let maxBalance: number | null = null
  switch (planCode) {
    case 'starter':
      periodAllowance = AI_CREDIT_CONFIG.starter.credits
      break
    case 'pro':
      periodAllowance =
        AI_CREDIT_CONFIG.pro.monthlyCredits[input.interval === 'year' ? 'yearly' : 'monthly']
      firstPeriodAllowance = AI_CREDIT_CONFIG.pro.initialCredits
      rollover = AI_CREDIT_CONFIG.pro.rollover
      maxBalance = AI_CREDIT_CONFIG.pro.maxBalance
      break
    case 'ecommerce':
      periodAllowance = AI_CREDIT_CONFIG.ecommerce.monthlyCredits
      firstPeriodAllowance = AI_CREDIT_CONFIG.ecommerce.initialCredits
      break
    default:
      break
  }

  return {
    planCode,
    balance,
    grantedThisPeriod: granted,
    usedThisPeriod: used,
    periodAllowance,
    firstPeriodAllowance,
    rollover,
    maxBalance,
    periodStart: start ? start.toISOString() : null,
    nextRenewal: next ? next.toISOString() : null,
  }
}
