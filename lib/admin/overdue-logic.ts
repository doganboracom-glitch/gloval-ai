import { addCalendarMonths } from '@/lib/billing-utils'

/**
 * Pure rules for the admin "Ödeme bekleyenler" screen and the manual
 * payment / gift actions. No database, no clock reads: `now` is an argument.
 */

const DAY_MS = 86_400_000

export const GIFT_MONTH_OPTIONS = [1, 2, 3] as const
export const DUPLICATE_WINDOW_MS = 60_000
export const REASON_MIN_LENGTH = 3
export const REASON_MAX_LENGTH = 500

/** Statuses a settlement may act on (mirrors RENEWABLE_STATUSES in billing-lifecycle). */
export const SETTLEABLE_STATUSES = ['trialing', 'active', 'past_due', 'suspended'] as const

export type OverdueReason = 'past_due' | 'payment_failed_suspended' | 'period_expired'

export type OverdueCandidate = {
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  suspensionReason: string | null
  planPriceCents: number
}

/**
 * Why a subscription is in the unpaid list, or `null` when it is not.
 * Free plans and subscriptions the user already chose to end are never unpaid.
 */
export function classifyOverdue(sub: OverdueCandidate, now: Date): OverdueReason | null {
  if (sub.planPriceCents <= 0) return null
  if (sub.status === 'past_due') return 'past_due'
  if (sub.status === 'suspended') {
    return sub.suspensionReason === 'renewal_payment_failed' || sub.suspensionReason === 'grace_period_expired'
      ? 'payment_failed_suspended'
      : null
  }
  if (sub.status === 'active' || sub.status === 'trialing') {
    if (sub.cancelAtPeriodEnd || !sub.currentPeriodEnd) return null
    const end = new Date(sub.currentPeriodEnd)
    return !Number.isNaN(end.getTime()) && end.getTime() <= now.getTime() ? 'period_expired' : null
  }
  return null
}

/** Whole days since the period ended; 0 when it has not ended (or is unknown). */
export function daysOverdue(currentPeriodEnd: string | null, now: Date): number {
  if (!currentPeriodEnd) return 0
  const end = new Date(currentPeriodEnd)
  if (Number.isNaN(end.getTime())) return 0
  return Math.max(0, Math.floor((now.getTime() - end.getTime()) / DAY_MS))
}

/** Everything except the in-memory `mock` provider is an external PSP. */
export function isProviderManaged(provider: string | null | undefined): boolean {
  return Boolean(provider) && provider !== 'mock' && provider !== 'manual' && provider !== 'gift'
}

export type SettlementKind = 'mark_paid' | 'gift'

/** Months a manual payment buys: one billing period of the plan. */
export function paidMonthsForInterval(interval: string | null | undefined): number {
  return interval === 'year' ? 12 : 1
}

/**
 * New period end for a manual settlement. Mirrors `settleSubscriptionRenewal`:
 * an ended (or unknown) period restarts from `now`; a period still in the
 * future is extended from its current end, so paid time is never lost.
 */
export function computeSettledPeriod(input: {
  currentPeriodEnd: string | null
  months: number
  now: Date
}): { start: Date; end: Date } {
  const previous = input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null
  const expired = !previous || Number.isNaN(previous.getTime()) || previous.getTime() <= input.now.getTime()
  const start = expired ? input.now : (previous as Date)
  return { start, end: addCalendarMonths(start, input.months) }
}

/** State fields a settlement leaves on the subscription row. */
export function settledSubscriptionState() {
  return {
    status: 'active' as const,
    grace_period_ends_at: null,
    suspended_at: null,
    suspension_reason: null,
    suspended_project_ids: [] as string[],
  }
}

export type SettlementValidation =
  | { ok: true; reason: string; months: number }
  | { ok: false; error: string }

export function validateSettlementInput(input: {
  kind: SettlementKind
  reason: string | undefined | null
  months?: number
  planPriceCents: number
  status: string
}): SettlementValidation {
  const reason = (input.reason ?? '').trim()
  if (reason.length < REASON_MIN_LENGTH) return { ok: false, error: 'reason_required' }
  if (reason.length > REASON_MAX_LENGTH) return { ok: false, error: 'reason_too_long' }
  if (!(SETTLEABLE_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: 'subscription_not_settleable' }
  }
  if (input.kind === 'gift') {
    const months = input.months ?? 1
    if (!(GIFT_MONTH_OPTIONS as readonly number[]).includes(months)) return { ok: false, error: 'invalid_months' }
    return { ok: true, reason, months }
  }
  if (input.planPriceCents <= 0) return { ok: false, error: 'free_plan_no_payment' }
  return { ok: true, reason, months: 0 }
}

/** True when an audit row for the same subscription landed inside the duplicate window. */
export function isRecentDuplicate(lastActionAt: string | Date | null | undefined, now: Date): boolean {
  if (!lastActionAt) return false
  const at = lastActionAt instanceof Date ? lastActionAt : new Date(lastActionAt)
  if (Number.isNaN(at.getTime())) return false
  const age = now.getTime() - at.getTime()
  return age >= 0 && age < DUPLICATE_WINDOW_MS
}

/** Client idempotency token if well-formed, else `null` (caller generates one). */
export function sanitizeIdempotencyToken(value: string | undefined | null): string | null {
  if (!value) return null
  return /^[A-Za-z0-9_-]{16,100}$/.test(value) ? value : null
}

/** Digits-only international number for `wa.me`; Turkish local numbers get `0` -> `90`. */
export function whatsappNumber(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  let normalized = digits
  if (normalized.startsWith('00')) normalized = normalized.slice(2)
  else if (normalized.startsWith('0')) normalized = `90${normalized.slice(1)}`
  else if (normalized.length === 10) normalized = `90${normalized}`
  return normalized.length >= 10 && normalized.length <= 15 ? normalized : null
}

export type OverdueSort = { daysOverdue: number }

export function compareOverdue(a: OverdueSort, b: OverdueSort): number {
  return b.daysOverdue - a.daysOverdue
}
