import 'server-only'

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tenantUrl } from '@/lib/domains'
import { SUPPORT_EMAIL, sendTransactionalEmailDetailed } from '@/lib/notify'
import { renderEmailLayout, renderStepCard, renderTable, escape } from '@/lib/email/layout'
import { resolveEmailLang } from '@/lib/email/lang'
import { getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
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
import { deliverInvoiceReady, type InvoiceDeliveryOutcome } from '@/lib/invoices/email-delivery'

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

type EventKind = LifecycleKind | 'invoice_ready'

type EventRow = {
  id: string
  user_id: string
  kind: EventKind
  project_id: string | null
  invoice_id: string | null
  file_sha256: string | null
  status: 'pending' | 'processing' | 'sent' | 'failed'
  attempts: number
  lease_until: string | null
}

const EVENT_COLUMNS = 'id, user_id, kind, project_id, invoice_id, file_sha256, status, attempts, lease_until'

/* -------------------------------- producers ------------------------------- */

async function insertEvent(row: {
  user_id: string
  kind: EventKind
  project_id?: string
  transition_id?: string
  invoice_id?: string
  dedupe_key?: string
  file_sha256?: string
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

/* ---------------------------- invoice-ready email --------------------------- */

export type InvoiceEmailQueueResult = 'queued' | 'duplicate' | 'in_progress' | 'no_recipient' | 'failed'

/** 'unknown' means the lookup itself failed; delivery retries it, so callers still queue. */
export async function resolveInvoiceRecipient(userId: string | null): Promise<'ok' | 'no_recipient' | 'unknown'> {
  if (!userId) return 'no_recipient'
  try {
    const { data, error } = await createAdminClient().auth.admin.getUserById(userId)
    if (error) return error.status === 404 ? 'no_recipient' : 'unknown'
    return data?.user?.email ? 'ok' : 'no_recipient'
  } catch {
    return 'unknown'
  }
}

export async function hasActiveInvoiceEmail(invoiceId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('email_events')
    .select('id')
    .eq('kind', 'invoice_ready')
    .eq('invoice_id', invoiceId)
    .in('status', ['pending', 'processing'])
    .limit(1)
  if (error) throw error
  return Boolean(data && data.length > 0)
}

/**
 * Queues the "invoice ready" email for one uploaded file. The automatic send is
 * deduplicated per invoice AND file checksum, so retrying an upload cannot send
 * twice while a replacement file still gets its own email. A resend (explicit
 * admin action) gets a unique key but is refused while another email for the
 * same invoice is still in flight. Never throws.
 */
export async function enqueueInvoiceReadyEmail(input: {
  invoiceId: string
  userId: string | null
  fileSha256: string
  resend?: boolean
}): Promise<InvoiceEmailQueueResult> {
  try {
    if ((await resolveInvoiceRecipient(input.userId)) === 'no_recipient' || !input.userId) return 'no_recipient'
    if (input.resend && (await hasActiveInvoiceEmail(input.invoiceId))) return 'in_progress'

    const baseKey = `invoice:${input.invoiceId}:${input.fileSha256}`
    const id = await insertEvent({
      user_id: input.userId,
      kind: 'invoice_ready',
      invoice_id: input.invoiceId,
      file_sha256: input.fileSha256,
      dedupe_key: input.resend ? `${baseKey}:resend:${crypto.randomUUID()}` : baseKey,
    })
    if (!id) return 'duplicate'
    scheduleImmediateAttempt(id)
    return 'queued'
  } catch (error) {
    console.log('[email-outbox] enqueue invoice email failed:', error instanceof Error ? error.message : 'unknown')
    return 'failed'
  }
}

/* ------------------------------ welcome email ------------------------------ */

/** Accounts older than this never get a backfilled welcome email. */
export const WELCOME_BACKFILL_WINDOW_MS = 24 * 60 * 60_000

export function isWithinWelcomeWindow(createdAt: string | null | undefined, now: Date = new Date()): boolean {
  const created = createdAt ? new Date(createdAt).getTime() : Number.NaN
  return Number.isFinite(created) && now.getTime() - created <= WELCOME_BACKFILL_WINDOW_MS
}

export type WelcomeCandidate = {
  id: string
  email_confirmed_at?: string | null
  created_at?: string | null
}

/**
 * Delivers the welcome email for a user whose address was just verified.
 *
 * - A row already exists (queued by the database trigger): it is claimed and
 *   sent now. A row that is sent, failed, processing or not yet due is left alone.
 * - No row exists (trigger did not fire): one is inserted only when the address
 *   is verified AND the account is younger than 24 hours, then sent now. The
 *   partial unique index on (user_id) for `account_welcome` makes a concurrent
 *   insert a no-op, so a second caller can never queue or send a duplicate.
 *
 * A failed send leaves the row `pending`; the cron sweep retries it. Never throws.
 */
export async function ensureAndSendWelcomeEmail(user: WelcomeCandidate, now: Date = new Date()): Promise<void> {
  try {
    if (!user.id || !user.email_confirmed_at) return

    const admin = createAdminClient()
    const { data: existing, error } = await admin
      .from('email_events')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('kind', 'account_welcome')
      .limit(1)
    if (error) throw error

    const row = (existing as { id: string; status: string }[] | null)?.[0]
    if (row) {
      if (row.status === 'pending') await processEventById(row.id)
      return
    }

    if (!isWithinWelcomeWindow(user.created_at, now)) return

    const id = await insertEvent({ user_id: user.id, kind: 'account_welcome' })
    if (id) await processEventById(id)
  } catch (error) {
    console.log('[email-outbox] welcome failed:', error instanceof Error ? error.message : 'unknown')
  }
}

/** Runs {@link ensureAndSendWelcomeEmail} after the response; a no-op outside a request scope. */
export function scheduleWelcomeEmail(user: WelcomeCandidate | null | undefined): void {
  if (!user?.id) return
  try {
    after(async () => {
      await ensureAndSendWelcomeEmail(user)
    })
  } catch {
    // Not inside a request scope; the trigger row plus the cron sweep still deliver it.
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

async function markSent(
  row: EventRow,
  messageId: string | null,
  attachment?: { state: 'attached' | 'omitted'; reason: string | null },
) {
  const { error } = await ownedUpdate(row, {
    status: 'sent',
    sent_at: new Date().toISOString(),
    provider_message_id: messageId,
    last_error: null,
    ...(attachment ? { attachment_state: attachment.state, attachment_reason: attachment.reason } : {}),
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
  | { type: 'sent'; messageId: string | null; attachment?: { state: 'attached' | 'omitted'; reason: string | null } }
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

  if (row.kind === 'invoice_ready') {
    const outcome: InvoiceDeliveryOutcome = await deliverInvoiceReady(row, { email: user.email, lang, name })
    return outcome
  }

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

  // Only the first-publish email differs by plan (soft upgrade hint vs. domain link).
  let plan: 'free' | 'paid' = 'free'
  if (row.kind === 'project_first_published') {
    plan = toPlanCode(await getPlanCodeForUser(row.user_id)) === 'free' ? 'free' : 'paid'
  }

  const copy = buildLifecycleCopy({
    kind: row.kind,
    lang,
    name,
    siteName,
    siteUrl,
    dashboardUrl: DASHBOARD_URL,
    supportEmail: SUPPORT_EMAIL,
    plan,
  })

  const body = [
    ...copy.paragraphs.map((p) => `<p style="margin:0 0 14px;">${escape(p)}</p>`),
    copy.steps ? renderStepCard(copy.steps.title, copy.steps.items) : '',
    copy.details ? renderTable(copy.details) : '',
    copy.note
      ? `<p style="margin:0 0 14px;">${escape(copy.note.text)} <a class="link" href="${escape(copy.note.href)}" style="color:#6d43bd;text-decoration:underline;">${escape(copy.note.label)}</a></p>`
      : '',
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
      await markSent(row, outcome.messageId, outcome.attachment)
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
