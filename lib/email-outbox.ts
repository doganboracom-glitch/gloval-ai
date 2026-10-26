import 'server-only'

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tenantUrl } from '@/lib/domains'
import { SUPPORT_EMAIL, sendTransactionalEmailDetailed } from '@/lib/notify'
import { renderEmailLayout, renderStepCard, renderTable, escape } from '@/lib/email/layout'
import { resolveEmailLang } from '@/lib/email/lang'
import {
  buildLifecycleCopy,
  firstNameOf,
  lifecycleCopyToText,
  type LifecycleKind,
} from '@/lib/email/lifecycle-copy'
import {
  LEASE_MS,
  MAX_ATTEMPTS,
  NOT_CONFIGURED_DELAY_MS,
  UNPUBLISH_DEDUPE_MS,
  classifyHttpFailure,
  decideRetry,
  sanitizeErrorCode,
} from '@/lib/email-outbox-policy'

/**
 * Lifecycle email outbox backed by `public.email_events`.
 *
 * Producers (`enqueue*`) only insert a row; delivery happens in
 * `processDueEmailEvents` (cron, every 5 minutes) and, for the events created
 * in a request, in one immediate `after()` attempt. A row is claimed with a
 * compare-and-set UPDATE (status + attempts, plus the lease for an expired
 * one), so two overlapping runs can never both own it, and the event id is the
 * provider Idempotency-Key as a second guard against double delivery.
 *
 * Everything is best-effort for the caller: enqueue helpers never throw.
 */

const DASHBOARD_URL = 'https://gloval.ai/dashboard'
const UNIQUE_VIOLATION = '23505'
const CRON_BATCH_LIMIT = 25

type EventRow = {
  id: string
  user_id: string
  kind: LifecycleKind
  project_id: string | null
  status: 'pending' | 'processing' | 'sent' | 'failed'
  attempts: number
  lease_until: string | null
}

const EVENT_COLUMNS = 'id, user_id, kind, project_id, status, attempts, lease_until'

/* -------------------------------- producers ------------------------------- */

async function insertEvent(row: {
  user_id: string
  kind: LifecycleKind
  project_id: string
  transition_id?: string
}): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('email_events').insert(row).select('id').single()
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return null
    throw error
  }
  return (data?.id as string | undefined) ?? null
}

/** Runs one immediate delivery attempt after the response; silently skipped outside a request. */
function scheduleImmediateAttempt(eventId: string): void {
  try {
    after(async () => {
      try {
        await processEventById(eventId)
      } catch (error) {
        console.log('[email-outbox] immediate attempt failed:', error instanceof Error ? error.message : 'unknown')
      }
    })
  } catch {
    // Not inside a request scope; the cron sweep delivers it.
  }
}

export async function enqueueProjectFirstPublishedEmail(input: {
  projectId: string
  ownerId: string
}): Promise<void> {
  try {
    const id = await insertEvent({
      user_id: input.ownerId,
      kind: 'project_first_published',
      project_id: input.projectId,
    })
    if (id) scheduleImmediateAttempt(id)
  } catch (error) {
    console.log('[email-outbox] enqueue first publish failed:', error instanceof Error ? error.message : 'unknown')
  }
}

export async function enqueueProjectUnpublishedEmail(input: {
  projectId: string
  ownerId: string
  now?: Date
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const since = new Date((input.now ?? new Date()).getTime() - UNPUBLISH_DEDUPE_MS).toISOString()
    const { data: recent, error: recentError } = await admin
      .from('email_events')
      .select('id')
      .eq('kind', 'project_unpublished')
      .eq('project_id', input.projectId)
      .gte('created_at', since)
      .limit(1)
    if (recentError) throw recentError
    if (recent && recent.length > 0) return

    const id = await insertEvent({
      user_id: input.ownerId,
      kind: 'project_unpublished',
      project_id: input.projectId,
      transition_id: crypto.randomUUID(),
    })
    if (id) scheduleImmediateAttempt(id)
  } catch (error) {
    console.log('[email-outbox] enqueue unpublish failed:', error instanceof Error ? error.message : 'unknown')
  }
}

/* --------------------------------- claiming -------------------------------- */

/**
 * Takes ownership of a row. Returns the claimed row (attempts already
 * incremented, lease set) or null when another worker got there first or the
 * row is not due. The UPDATE's WHERE clause is the lock: it only matches while
 * status/attempts (and the lease, for a stale one) are still what we read.
 */
async function claim(row: EventRow, now: Date): Promise<EventRow | null> {
  const admin = createAdminClient()
  const nowIso = now.toISOString()
  let query = admin
    .from('email_events')
    .update({
      status: 'processing',
      attempts: row.attempts + 1,
      lease_until: new Date(now.getTime() + LEASE_MS).toISOString(),
      updated_at: nowIso,
    })
    .eq('id', row.id)
    .eq('status', row.status)
    .eq('attempts', row.attempts)

  query =
    row.status === 'pending'
      ? query.lte('next_attempt_at', nowIso)
      : query.lt('lease_until', nowIso)

  const { data, error } = await query.select(EVENT_COLUMNS).maybeSingle()
  if (error) {
    console.log('[email-outbox] claim failed:', error.message)
    return null
  }
  return (data as EventRow | null) ?? null
}

/** Finishing updates only apply while this worker still owns the attempt. */
function ownedUpdate(row: EventRow, patch: Record<string, unknown>) {
  const admin = createAdminClient()
  return admin
    .from('email_events')
    .update({ ...patch, lease_until: null, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'processing')
    .eq('attempts', row.attempts)
}

async function markSent(row: EventRow, messageId: string | null) {
  const { error } = await ownedUpdate(row, {
    status: 'sent',
    sent_at: new Date().toISOString(),
    provider_message_id: messageId,
    last_error: null,
  })
  if (error) console.log('[email-outbox] mark sent failed:', error.message)
}

async function markFailed(row: EventRow, code: string) {
  const { error } = await ownedUpdate(row, { status: 'failed', last_error: sanitizeErrorCode(code) })
  if (error) console.log('[email-outbox] mark failed failed:', error.message)
}

async function markRetry(row: EventRow, code: string) {
  const decision = decideRetry(row.attempts, code, new Date())
  if (decision.action === 'fail') return markFailed(row, `${decision.code}`)
  const { error } = await ownedUpdate(row, {
    status: 'pending',
    next_attempt_at: decision.nextAttemptAt.toISOString(),
    last_error: sanitizeErrorCode(code),
  })
  if (error) console.log('[email-outbox] mark retry failed:', error.message)
}

/** Mail is not configured: park the row without spending one of its attempts. */
async function markDeferred(row: EventRow) {
  const { error } = await ownedUpdate(row, {
    status: 'pending',
    attempts: row.attempts - 1,
    next_attempt_at: new Date(Date.now() + NOT_CONFIGURED_DELAY_MS).toISOString(),
    last_error: 'not_configured',
  })
  if (error) console.log('[email-outbox] mark deferred failed:', error.message)
}

/* -------------------------------- delivery --------------------------------- */

type Outcome =
  | { type: 'sent'; messageId: string | null }
  | { type: 'retry'; code: string }
  | { type: 'fail'; code: string }
  | { type: 'defer' }

async function deliver(row: EventRow): Promise<Outcome> {
  const admin = createAdminClient()

  // Address and language are read from auth at send time and never stored.
  const { data: authData, error: authError } = await admin.auth.admin.getUserById(row.user_id)
  if (authError || !authData?.user) {
    if (authError && authError.status !== 404) return { type: 'retry', code: 'auth_lookup_failed' }
    return { type: 'fail', code: 'user_missing' }
  }
  const user = authData.user
  if (!user.email) return { type: 'fail', code: 'no_recipient' }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>
  const lang = resolveEmailLang(metadata.email_locale)
  const name = firstNameOf(metadata.full_name ?? metadata.name ?? metadata.display_name)

  let siteName: string | undefined
  let siteUrl: string | undefined
  if (row.kind !== 'account_welcome') {
    if (!row.project_id) return { type: 'fail', code: 'project_missing' }
    const { data: project, error: projectError } = await admin
      .from('projects')
      .select('name, slug')
      .eq('id', row.project_id)
      .maybeSingle()
    if (projectError) return { type: 'retry', code: 'project_lookup_failed' }
    if (!project) return { type: 'fail', code: 'project_missing' }
    siteName = (project.name as string | null) ?? undefined
    siteUrl = project.slug ? tenantUrl(project.slug as string) : undefined
  }

  const copy = buildLifecycleCopy({
    kind: row.kind,
    lang,
    name,
    siteName,
    siteUrl,
    dashboardUrl: DASHBOARD_URL,
    supportEmail: SUPPORT_EMAIL,
  })

  const body = [
    ...copy.paragraphs.map((p) => `<p style="margin:0 0 14px;">${escape(p)}</p>`),
    copy.steps ? renderStepCard(copy.steps.title, copy.steps.items) : '',
    copy.details ? renderTable(copy.details) : '',
  ].join('')

  const html = renderEmailLayout({
    lang,
    previewText: copy.previewText,
    title: copy.title,
    body,
    cta: copy.cta,
    footer: copy.footer,
  })

  const result = await sendTransactionalEmailDetailed({
    to: user.email,
    subject: copy.subject,
    html,
    text: lifecycleCopyToText(copy),
    replyTo: SUPPORT_EMAIL,
    idempotencyKey: `email-event-${row.id}`,
  })

  if (result.ok) return { type: 'sent', messageId: result.messageId }
  if (result.reason === 'not_configured') return { type: 'defer' }
  const failure = classifyHttpFailure(result.reason === 'http' ? result.status : null)
  return failure.retryable ? { type: 'retry', code: failure.code } : { type: 'fail', code: failure.code }
}

async function processClaimed(row: EventRow): Promise<'sent' | 'retry' | 'failed' | 'deferred'> {
  let outcome: Outcome
  try {
    outcome = await deliver(row)
  } catch (error) {
    console.log('[email-outbox] delivery threw:', error instanceof Error ? error.name : 'unknown')
    outcome = { type: 'retry', code: 'delivery_error' }
  }

  switch (outcome.type) {
    case 'sent':
      await markSent(row, outcome.messageId)
      return 'sent'
    case 'defer':
      await markDeferred(row)
      return 'deferred'
    case 'fail':
      await markFailed(row, outcome.code)
      return 'failed'
    case 'retry':
      await markRetry(row, outcome.code)
      return row.attempts >= MAX_ATTEMPTS ? 'failed' : 'retry'
  }
}

/** Immediate attempt for one freshly queued event. */
export async function processEventById(id: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('email_events').select(EVENT_COLUMNS).eq('id', id).maybeSingle()
  if (error || !data) return
  const claimed = await claim(data as EventRow, new Date())
  if (claimed) await processClaimed(claimed)
}

export type OutboxRunResult = {
  sent: number
  retry: number
  failed: number
  deferred: number
  expiredLeases: number
}

/** Cron entry point: delivers due `pending` rows and recovers rows whose lease expired. */
export async function processDueEmailEvents(options: {
  deadlineMs: number
  limit?: number
}): Promise<OutboxRunResult> {
  const admin = createAdminClient()
  const limit = options.limit ?? CRON_BATCH_LIMIT
  const result: OutboxRunResult = { sent: 0, retry: 0, failed: 0, deferred: 0, expiredLeases: 0 }
  const nowIso = new Date().toISOString()

  const [pending, stale] = await Promise.all([
    admin
      .from('email_events')
      .select(EVENT_COLUMNS)
      .eq('status', 'pending')
      .lte('next_attempt_at', nowIso)
      .order('next_attempt_at', { ascending: true })
      .limit(limit),
    admin
      .from('email_events')
      .select(EVENT_COLUMNS)
      .eq('status', 'processing')
      .lt('lease_until', nowIso)
      .order('lease_until', { ascending: true })
      .limit(limit),
  ])
  if (pending.error) throw pending.error
  if (stale.error) throw stale.error

  const candidates = [...((stale.data ?? []) as EventRow[]), ...((pending.data ?? []) as EventRow[])].slice(0, limit)

  for (const candidate of candidates) {
    if (Date.now() >= options.deadlineMs) break
    const claimed = await claim(candidate, new Date())
    if (!claimed) continue
    if (candidate.status === 'processing') {
      result.expiredLeases += 1
      // A worker that died after its final attempt must not be retried forever.
      if (claimed.attempts > MAX_ATTEMPTS) {
        await markFailed(claimed, 'max_attempts')
        result.failed += 1
        continue
      }
    }
    const outcome = await processClaimed(claimed)
    result[outcome] += 1
  }

  return result
}
