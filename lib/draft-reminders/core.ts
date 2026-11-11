export const DRAFT_REMINDER_KINDS = ['d7', 'd30', 'm6', 'm12'] as const
export type DraftReminderKind = (typeof DRAFT_REMINDER_KINDS)[number]

export const STAGE_MIN_INACTIVE_DAYS: Record<DraftReminderKind, number> = {
  d7: 7,
  d30: 30,
  m6: 182,
  m12: 365,
}

export const MIN_DAYS_BETWEEN_STAGES = 14
export const MAX_FAILED_ATTEMPTS = 3
export const DEFAULT_MAX_PER_RUN = 50
export const MAX_PER_RUN_CEILING = 500

const DAY_MS = 86_400_000
// Turkey has no daylight saving time: UTC+3 all year.
const TURKEY_OFFSET_MS = 3 * 3_600_000

export type ReminderStatus = 'sent' | 'failed' | 'dry_run'

export type ReminderRecord = {
  kind: DraftReminderKind
  status: ReminderStatus
  createdAt: string
}

export type DraftReminderConfig = {
  enabled: boolean
  dryRun: boolean
  maxPerRun: number
}

/** Calendar day number in Turkey time; day boundaries are midnight Europe/Istanbul. */
export function turkeyDayNumber(value: Date | string | number): number {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Math.floor((ms + TURKEY_OFFSET_MS) / DAY_MS)
}

export function turkeyDaysBetween(from: Date | string, to: Date | string): number {
  return turkeyDayNumber(to) - turkeyDayNumber(from)
}

export function resolveDraftReminderConfig(env: Record<string, string | undefined> = process.env): DraftReminderConfig {
  const on = (value: string | undefined) => ['true', '1', 'yes'].includes((value ?? '').trim().toLowerCase())
  const off = (value: string | undefined) => ['false', '0', 'no'].includes((value ?? '').trim().toLowerCase())
  const parsed = Number.parseInt((env.DRAFT_REMINDERS_MAX_PER_RUN ?? '').trim(), 10)
  const maxPerRun = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_PER_RUN_CEILING) : DEFAULT_MAX_PER_RUN
  return {
    enabled: on(env.DRAFT_REMINDERS_AUTO_ENABLED),
    // Dry run is the default: only an explicit "false" turns real sending on.
    dryRun: !off(env.DRAFT_REMINDERS_DRY_RUN),
    maxPerRun,
  }
}

export type PlanSkipReason =
  | 'no_activity'
  | 'sequence_complete'
  | 'too_soon_after_last'
  | 'not_due'
  | 'retries_exhausted'
  | 'already_attempted_today'
  | 'dry_run_recorded'

export type ReminderPlan = { kind: DraftReminderKind } | { skip: PlanSkipReason }

/**
 * Decides the ONE reminder a project may receive right now: the first stage that
 * has not been sent yet, never a higher one. A stage is due once the project has
 * been inactive long enough AND at least MIN_DAYS_BETWEEN_STAGES passed since the
 * previous sent reminder. Inactivity is measured from the newest real activity,
 * so new activity restarts the clock for the NEXT stage without repeating a sent one.
 */
export function planDraftReminder(input: {
  lastActivityAt: string | null
  now: Date
  records: readonly ReminderRecord[]
  dryRun: boolean
}): ReminderPlan {
  const { lastActivityAt, now, records, dryRun } = input
  if (!lastActivityAt || Number.isNaN(new Date(lastActivityAt).getTime())) return { skip: 'no_activity' }

  const sent = records.filter((r) => r.status === 'sent')
  const sentKinds = new Set(sent.map((r) => r.kind))
  const kind = DRAFT_REMINDER_KINDS.find((candidate) => !sentKinds.has(candidate))
  if (!kind) return { skip: 'sequence_complete' }

  const lastSentAt = sent.reduce<string | null>(
    (latest, r) => (latest === null || r.createdAt > latest ? r.createdAt : latest),
    null,
  )
  if (lastSentAt && turkeyDaysBetween(lastSentAt, now) < MIN_DAYS_BETWEEN_STAGES) {
    return { skip: 'too_soon_after_last' }
  }

  if (turkeyDaysBetween(lastActivityAt, now) < STAGE_MIN_INACTIVE_DAYS[kind]) return { skip: 'not_due' }

  const failed = records.filter((r) => r.status === 'failed' && r.kind === kind)
  if (failed.length > 0) {
    const firstFailureAt = failed.reduce((first, r) => (r.createdAt < first ? r.createdAt : first), failed[0].createdAt)
    if (failed.length >= MAX_FAILED_ATTEMPTS || turkeyDaysBetween(firstFailureAt, now) >= MAX_FAILED_ATTEMPTS) {
      return { skip: 'retries_exhausted' }
    }
    if (failed.some((r) => turkeyDayNumber(r.createdAt) === turkeyDayNumber(now))) {
      return { skip: 'already_attempted_today' }
    }
  }

  if (dryRun && records.some((r) => r.status === 'dry_run' && r.kind === kind)) {
    return { skip: 'dry_run_recorded' }
  }

  return { kind }
}

/** Platform admins are handled by the caller; this matches obvious test/QA mailboxes. */
export function isTestAccountEmail(email: string | null | undefined): boolean {
  const value = (email ?? '').trim().toLowerCase()
  if (!value.includes('@')) return false
  const [local, domain] = [value.slice(0, value.lastIndexOf('@')), value.slice(value.lastIndexOf('@') + 1)]
  if (domain === 'gloval.ai' && (local === 'test' || local.startsWith('test+') || local.startsWith('test.'))) return true
  return domain === 'example.com' || domain.endsWith('.test') || domain.endsWith('.invalid')
}
