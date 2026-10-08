import { toPlanCode, type PlanCode } from '@/lib/pricing-config'

/**
 * Pure mail-access state machine. No database, no Mailcow, no clock reads:
 * everything it needs is an argument, so it is trivially testable.
 *
 * Mail access is `active` while AT LEAST ONE source is valid (a main package
 * that includes mail, or a standalone GLOVAL Mail add-on). When the last valid
 * source ends, the domain gets a mail-only grace period (`grace`: login and
 * sending closed, delivery of incoming mail continues) and then `suspended`.
 */

export type MailAccessStatus = 'active' | 'grace' | 'suspended'

export type MailAccessSourceKind = 'plan' | 'addon'

export type MailAccessSource = {
  kind: MailAccessSourceKind
  /** Whether the source's status entitles mail (e.g. subscription trialing/active/past_due). */
  entitled: boolean
  /** End of the paid period. `null` means open-ended. */
  endsAt: Date | string | null
  /**
   * When an un-entitled source stopped entitling (e.g. cancelled immediately),
   * if known. The earlier of this and `endsAt` is the moment access was lost.
   */
  endedAt?: Date | string | null
}

export type MailAccessInput = {
  sources: readonly MailAccessSource[]
  now: Date
  graceDays: number
  /**
   * Used only when no source carries a usable end date (e.g. the user never
   * had one). Typically the grace start already stored on the domain.
   */
  fallbackEndedAt?: Date | string | null
}

export type MailAccessState = {
  status: MailAccessStatus
  /** Moment access was lost; `null` while active. */
  graceStartedAt: Date | null
  graceEndsAt: Date | null
  /** Whole days left in grace (rounded up, at least 1); `null` outside grace. */
  graceDaysRemaining: number | null
  /** Kinds of the sources that are currently valid. */
  validSources: MailAccessSourceKind[]
}

export const DEFAULT_MAIL_GRACE_DAYS = 14
const DAY_MS = 86_400_000

/** Mailboxes included per main package. Limits enforcement lives elsewhere. */
export const PLAN_INCLUDED_MAILBOXES: Record<PlanCode, number> = {
  free: 0,
  starter: 1,
  pro: 3,
  ecommerce: 5,
}

export function planIncludesMail(planCode: string | null | undefined): boolean {
  return PLAN_INCLUDED_MAILBOXES[toPlanCode(planCode)] > 0
}

/**
 * End of validity of a subscription-backed mail source. A `past_due` plan is
 * still inside its billing grace window until `grace_period_ends_at`, so mail
 * stays fully open until then and mail's own grace starts only afterwards:
 * `max(current_period_end, grace_period_ends_at)`. Every other status, and a
 * `past_due` row without a usable grace end, keeps `current_period_end`.
 */
export function subscriptionSourceEndsAt(
  status: string,
  currentPeriodEnd: Date | string | null,
  gracePeriodEndsAt: Date | string | null | undefined,
): Date | string | null {
  if (status !== 'past_due') return currentPeriodEnd
  const periodEnd = toDate(currentPeriodEnd)
  const graceEnd = toDate(gracePeriodEndsAt)
  // An open-ended period (null) stays open-ended.
  if (periodEnd === null || graceEnd === null) return currentPeriodEnd
  return graceEnd.getTime() > periodEnd.getTime() ? gracePeriodEndsAt! : currentPeriodEnd
}

/** `MAIL_GRACE_DAYS` env value -> whole days. Missing/invalid falls back to the default; `0` disables grace. */
export function resolveMailGraceDays(raw: string | undefined | null): number {
  if (raw === undefined || raw === null || raw.trim() === '') return DEFAULT_MAIL_GRACE_DAYS
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_MAIL_GRACE_DAYS
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** The moment an invalid source stopped granting access, or `null` when unknown. */
function endedAtOf(source: MailAccessSource, now: Date): Date | null {
  const endsAt = toDate(source.endsAt)
  if (source.entitled) return endsAt
  const candidates = [endsAt, toDate(source.endedAt)].filter((d): d is Date => d !== null)
  if (candidates.length === 0) return null
  const earliest = new Date(Math.min(...candidates.map((d) => d.getTime())))
  // A cancelled source can still carry a future period end; access is gone now.
  return earliest.getTime() > now.getTime() ? now : earliest
}

/** A source grants access strictly before its end: at `endsAt === now` it is over. */
function isValid(source: MailAccessSource, now: Date): boolean {
  if (!source.entitled) return false
  const endsAt = toDate(source.endsAt)
  return endsAt === null || endsAt.getTime() > now.getTime()
}

export function computeMailAccess(input: MailAccessInput): MailAccessState {
  const { sources, now, graceDays } = input

  const validSources = sources.filter((s) => isValid(s, now)).map((s) => s.kind)
  if (validSources.length > 0) {
    return { status: 'active', graceStartedAt: null, graceEndsAt: null, graceDaysRemaining: null, validSources }
  }

  const ended = sources
    .map((s) => endedAtOf(s, now))
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime())
  const fallback = toDate(input.fallbackEndedAt)
  const startMs = ended.length > 0 ? Math.max(...ended) : Math.min(fallback?.getTime() ?? now.getTime(), now.getTime())
  const graceStartedAt = new Date(startMs)
  const graceEndsAt = new Date(startMs + Math.max(0, graceDays) * DAY_MS)

  if (now.getTime() >= graceEndsAt.getTime()) {
    return { status: 'suspended', graceStartedAt, graceEndsAt, graceDaysRemaining: null, validSources: [] }
  }
  return {
    status: 'grace',
    graceStartedAt,
    graceEndsAt,
    graceDaysRemaining: Math.max(1, Math.ceil((graceEndsAt.getTime() - now.getTime()) / DAY_MS)),
    validSources: [],
  }
}
