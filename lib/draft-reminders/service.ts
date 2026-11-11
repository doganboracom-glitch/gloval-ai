import {
  isTestAccountEmail,
  planDraftReminder,
  type DraftReminderConfig,
  type DraftReminderKind,
  type PlanSkipReason,
  type ReminderRecord,
} from './core'

/** Projects older than this many pages * PAGE_SIZE are not scanned in a single run. */
export const SCAN_PAGE_SIZE = 500
export const SCAN_MAX_PAGES = 20

export type DraftCandidate = {
  projectId: string
  ownerId: string
  projectType: string
  published: boolean
  remindersMuted: boolean
}

export type OwnerProfile = {
  id: string
  email: string | null
  status: string | null
  language: string | null
  optOut: boolean
}

export type Recipient = { email: string; locale: unknown }

export type ClaimResult = { status: 'claimed'; logId: string | null } | { status: 'duplicate' }

export type RecordInput = {
  projectId: string
  userId: string
  kind: DraftReminderKind
  status: 'sent' | 'failed' | 'dry_run'
  errorCode?: string | null
  notificationLogId?: string | null
}

/** Everything the sweep needs from the outside world; the cron wires real implementations. */
export interface DraftReminderStore {
  listCandidates(offset: number, limit: number): Promise<DraftCandidate[]>
  loadProfiles(userIds: string[]): Promise<Map<string, OwnerProfile>>
  /** Newest real activity per project. Must throw when it cannot be determined. */
  loadLastActivity(projectIds: string[]): Promise<Map<string, string | null>>
  loadRecords(projectIds: string[]): Promise<Map<string, ReminderRecord[]>>
  resolveRecipient(userId: string): Promise<Recipient | null>
  claimLog(input: { userId: string; kind: DraftReminderKind; projectId: string; subject: string; dedupeKey: string }): Promise<ClaimResult>
  releaseLog(dedupeKey: string): Promise<void>
  insertRecord(input: RecordInput): Promise<'ok' | 'duplicate' | 'error'>
}

export type SendResult = { ok: true } | { ok: false; errorCode: string }

export type DraftReminderDeps = {
  store: DraftReminderStore
  send: (input: { to: string; subject: string; html: string; text: string; idempotencyKey: string }) => Promise<SendResult>
  buildEmail: (input: {
    kind: DraftReminderKind
    lang: unknown[]
    projectId: string
    userId: string
    isEcommerce: boolean
  }) => { subject: string; html: string; text: string } | null
  isAdminEmail: (email: string | null | undefined) => boolean
  now: Date
  config: DraftReminderConfig
}

export type DraftReminderSummary = {
  scanned: number
  attempted: number
  sent: number
  failed: number
  dryRunRecorded: number
  duplicates: number
  errors: number
  skipped: Record<string, number>
}

export const draftReminderDedupeKey = (projectId: string, kind: DraftReminderKind) => `draft-reminder:${projectId}:${kind}`

export async function runDraftReminders(deps: DraftReminderDeps): Promise<DraftReminderSummary> {
  const { store, config, now } = deps
  const summary: DraftReminderSummary = {
    scanned: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    dryRunRecorded: 0,
    duplicates: 0,
    errors: 0,
    skipped: {},
  }
  const skip = (reason: PlanSkipReason | string) => {
    summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1
  }
  // One email per user per run, so an owner with several drafts is not flooded.
  const handledUsers = new Set<string>()

  for (let page = 0; page < SCAN_MAX_PAGES && summary.attempted < config.maxPerRun; page += 1) {
    const candidates = await store.listCandidates(page * SCAN_PAGE_SIZE, SCAN_PAGE_SIZE)
    if (candidates.length === 0) break
    summary.scanned += candidates.length

    const projectIds = candidates.map((c) => c.projectId)
    const ownerIds = [...new Set(candidates.map((c) => c.ownerId))]
    const [profiles, activity, records] = await Promise.all([
      store.loadProfiles(ownerIds),
      store.loadLastActivity(projectIds),
      store.loadRecords(projectIds),
    ])

    for (const candidate of candidates) {
      if (summary.attempted >= config.maxPerRun) break
      try {
        const profile = profiles.get(candidate.ownerId)
        if (candidate.published) {
          skip('published')
        } else if (candidate.remindersMuted) {
          skip('project_muted')
        } else if (!profile || profile.status !== 'active') {
          skip('inactive_account')
        } else if (profile.optOut) {
          skip('opted_out')
        } else if (!profile.email) {
          skip('no_email')
        } else if (deps.isAdminEmail(profile.email) || isTestAccountEmail(profile.email)) {
          skip('admin_or_test')
        } else if (handledUsers.has(candidate.ownerId)) {
          skip('user_already_handled')
        } else {
          const plan = planDraftReminder({
            lastActivityAt: activity.get(candidate.projectId) ?? null,
            now,
            records: records.get(candidate.projectId) ?? [],
            dryRun: config.dryRun,
          })
          if ('skip' in plan) {
            skip(plan.skip)
          } else {
            summary.attempted += 1
            handledUsers.add(candidate.ownerId)
            await processReminder(deps, summary, candidate, profile, plan.kind)
          }
        }
      } catch (error) {
        summary.errors += 1
        console.warn('[draft-reminders] project failed:', error instanceof Error ? error.name : 'unknown')
      }
    }

    if (candidates.length < SCAN_PAGE_SIZE) break
  }

  return summary
}

async function processReminder(
  deps: DraftReminderDeps,
  summary: DraftReminderSummary,
  candidate: DraftCandidate,
  profile: OwnerProfile,
  kind: DraftReminderKind,
): Promise<void> {
  const { store, config } = deps
  const base = { projectId: candidate.projectId, userId: candidate.ownerId, kind }

  if (config.dryRun) {
    const outcome = await store.insertRecord({ ...base, status: 'dry_run' })
    if (outcome === 'ok') summary.dryRunRecorded += 1
    else if (outcome === 'duplicate') summary.duplicates += 1
    else summary.errors += 1
    return
  }

  const fail = async (errorCode: string) => {
    summary.failed += 1
    await store.insertRecord({ ...base, status: 'failed', errorCode })
  }

  const recipient = await store.resolveRecipient(candidate.ownerId)
  if (!recipient) return fail('no_recipient')
  if (deps.isAdminEmail(recipient.email) || isTestAccountEmail(recipient.email)) {
    summary.skipped.admin_or_test = (summary.skipped.admin_or_test ?? 0) + 1
    return
  }

  const email = deps.buildEmail({
    kind,
    lang: [recipient.locale, profile.language],
    projectId: candidate.projectId,
    userId: candidate.ownerId,
    isEcommerce: candidate.projectType === 'ecommerce',
  })
  if (!email) return fail('not_configured')

  const dedupeKey = draftReminderDedupeKey(candidate.projectId, kind)
  const claim = await store.claimLog({
    userId: candidate.ownerId,
    kind,
    projectId: candidate.projectId,
    subject: email.subject,
    dedupeKey,
  })
  if (claim.status === 'duplicate') {
    summary.duplicates += 1
    return
  }

  const result = await deps.send({
    to: recipient.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    idempotencyKey: dedupeKey,
  })

  if (!result.ok) {
    await store.releaseLog(dedupeKey)
    return fail(result.errorCode)
  }

  summary.sent += 1
  const outcome = await store.insertRecord({ ...base, status: 'sent', notificationLogId: claim.logId })
  if (outcome === 'error') summary.errors += 1
}
