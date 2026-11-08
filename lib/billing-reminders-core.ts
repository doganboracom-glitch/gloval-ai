/**
 * Pure rules for the subscription reminder emails (renewal coming up, period
 * ending after a cancellation, payment failed, suspended). No I/O: the sweep
 * in `lib/billing-reminders.ts` and the outbox delivery both call these, so the
 * "is this email due / still valid" decision lives in exactly one place.
 *
 * Every rule picks only the stage the subscription is in RIGHT NOW. A cron that
 * was down therefore never sends a pile of stale reminders on its next run.
 */

export const DAY_MS = 86_400_000

export const BILLING_REMINDER_KINDS = [
  'renewal_upcoming_7d',
  'renewal_upcoming_3d',
  'renewal_upcoming_1d',
  'period_ending_notice',
  'payment_failed',
  'payment_failed_day2',
  'payment_failed_final',
  'subscription_suspended',
] as const

export type BillingReminderKind = (typeof BILLING_REMINDER_KINDS)[number]

export function isBillingReminderKind(value: unknown): value is BillingReminderKind {
  return typeof value === 'string' && (BILLING_REMINDER_KINDS as readonly string[]).includes(value)
}

export const DEFAULT_GRACE_DAYS = 7
/** Days before the period end at which a cancelled subscription is told it is ending. */
export const PERIOD_ENDING_NOTICE_DAYS = 3
/** Days after the payment failure at which the first follow-up is sent. */
export const PAYMENT_FAILED_FOLLOWUP_DAYS = 2
/** The final warning goes out when this much (or less) of the grace window is left. */
export const PAYMENT_FAILED_FINAL_DAYS = 1
/**
 * A suspension older than this never gets an email, so deploying this feature
 * cannot mass-mail accounts that were suspended long ago.
 */
export const SUSPENDED_NOTICE_WINDOW_DAYS = 3

/** Providers that never charge the customer automatically, so payment reminders would be wrong. */
const NON_BILLED_PROVIDERS = new Set(['mock', 'manual', 'gift'])

export type ReminderSubscription = {
  id: string
  status: string
  provider: string | null
  cancel_at_period_end: boolean
  current_period_end: string | null
  grace_period_ends_at: string | null
  suspended_at: string | null
  plan: { price_cents: number; interval: string } | null
}

export function resolveGraceDays(raw: string | undefined): number {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_GRACE_DAYS
}

/** Whole days left, rounded up, so "7 days" means up to and including 7 full days. */
export function daysLeft(periodEnd: string | Date, now: Date): number {
  const end = periodEnd instanceof Date ? periodEnd.getTime() : Date.parse(periodEnd)
  return Math.ceil((end - now.getTime()) / DAY_MS)
}

export function isBilledSubscription(sub: ReminderSubscription): boolean {
  if (sub.provider && NON_BILLED_PROVIDERS.has(sub.provider)) return false
  if (!sub.plan) return false
  return sub.plan.price_cents > 0 && sub.plan.interval !== 'once'
}

export function resolveGraceEnd(sub: ReminderSubscription, graceDays: number): Date | null {
  if (sub.status === 'past_due' && sub.grace_period_ends_at) return new Date(sub.grace_period_ends_at)
  if (!sub.current_period_end) return null
  return new Date(Date.parse(sub.current_period_end) + graceDays * DAY_MS)
}

function paymentFailureStage(
  periodEnd: number,
  graceEnd: Date,
  now: Date,
): 'payment_failed' | 'payment_failed_day2' | 'payment_failed_final' | null {
  const remaining = graceEnd.getTime() - now.getTime()
  if (remaining <= 0) return null
  if (remaining <= PAYMENT_FAILED_FINAL_DAYS * DAY_MS) return 'payment_failed_final'
  if (now.getTime() - periodEnd >= PAYMENT_FAILED_FOLLOWUP_DAYS * DAY_MS) return 'payment_failed_day2'
  return 'payment_failed'
}

/** The reminder this subscription is due for right now, or null. */
export function resolveDueReminder(
  sub: ReminderSubscription,
  now: Date,
  graceDays: number,
): { kind: BillingReminderKind; periodEnd: string } | null {
  if (!isBilledSubscription(sub) || !sub.current_period_end) return null
  const end = Date.parse(sub.current_period_end)
  if (!Number.isFinite(end)) return null
  const periodEnd = new Date(end).toISOString()
  const due = (kind: BillingReminderKind) => ({ kind, periodEnd })

  if (sub.status === 'active' && end > now.getTime()) {
    const left = daysLeft(sub.current_period_end, now)
    if (sub.cancel_at_period_end) return left <= PERIOD_ENDING_NOTICE_DAYS ? due('period_ending_notice') : null
    if (left <= 1) return due('renewal_upcoming_1d')
    if (left <= 3) return due('renewal_upcoming_3d')
    if (left <= 7) return due('renewal_upcoming_7d')
    return null
  }

  if ((sub.status === 'active' || sub.status === 'past_due') && end <= now.getTime()) {
    if (sub.cancel_at_period_end) return null
    const graceEnd = resolveGraceEnd(sub, graceDays)
    if (!graceEnd) return null
    const stage = paymentFailureStage(end, graceEnd, now)
    return stage ? due(stage) : null
  }

  if (sub.status === 'suspended') {
    const since = Date.parse(sub.suspended_at ?? '')
    if (!Number.isFinite(since)) return null
    return now.getTime() - since <= SUSPENDED_NOTICE_WINDOW_DAYS * DAY_MS ? due('subscription_suspended') : null
  }

  return null
}

/**
 * Re-checks, at send time, that a queued reminder still applies: the period it
 * was queued for must still be the current one (a renewal moves it) and the
 * subscription must still be in the matching state. Stale mails are dropped
 * instead of telling a customer who already paid that their payment failed.
 */
export function isReminderStillApplicable(
  kind: BillingReminderKind,
  queuedPeriodEnd: string,
  sub: ReminderSubscription,
  now: Date,
  graceDays: number,
): boolean {
  if (!isBilledSubscription(sub) || !sub.current_period_end) return false
  const end = Date.parse(sub.current_period_end)
  if (!Number.isFinite(end) || end !== Date.parse(queuedPeriodEnd)) return false

  switch (kind) {
    case 'renewal_upcoming_7d':
    case 'renewal_upcoming_3d':
    case 'renewal_upcoming_1d':
      return sub.status === 'active' && !sub.cancel_at_period_end && end > now.getTime()
    case 'period_ending_notice':
      return sub.status === 'active' && sub.cancel_at_period_end && end > now.getTime()
    case 'payment_failed':
    case 'payment_failed_day2':
    case 'payment_failed_final': {
      if (sub.cancel_at_period_end || end > now.getTime()) return false
      if (sub.status !== 'active' && sub.status !== 'past_due') return false
      const graceEnd = resolveGraceEnd(sub, graceDays)
      return graceEnd !== null && graceEnd.getTime() > now.getTime()
    }
    case 'subscription_suspended':
      return sub.status === 'suspended'
  }
}

const KEY_PATTERN = /^billing:([0-9a-f-]{36}):(.+):([a-z0-9_]+)$/i

/** One row per subscription + billing period + reminder kind. A renewal moves the period, so the next cycle starts fresh. */
export function billingReminderDedupeKey(subscriptionId: string, periodEnd: string, kind: BillingReminderKind): string {
  return `billing:${subscriptionId}:${new Date(periodEnd).toISOString()}:${kind}`
}

export function parseBillingReminderKey(
  key: string | null | undefined,
): { subscriptionId: string; periodEnd: string; kind: BillingReminderKind } | null {
  const match = key ? KEY_PATTERN.exec(key) : null
  if (!match || !isBillingReminderKind(match[3]) || !Number.isFinite(Date.parse(match[2]))) return null
  return { subscriptionId: match[1], periodEnd: match[2], kind: match[3] }
}
