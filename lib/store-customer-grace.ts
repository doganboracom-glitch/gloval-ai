import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { claimNotification, sendTransactionalEmail } from '@/lib/notify'
import { resolveEmailLang } from '@/lib/email/lang'
import { findContactEmail } from '@/lib/store-order-notifications'
import {
  renderStoreAccountRestoredEmail,
  renderStoreAccountSuspendedEmail,
} from '@/lib/store-customer-email'
import {
  anonymizeStoreCustomer,
  customerHasBlockingOrders,
  sendAccountDeletedEmail,
} from '@/lib/store-customer-deletion'
import {
  addDaysIso,
  buildRestorePatch,
  buildSuspendPatch,
  DELETION_POSTPONE_DAYS,
  DELETION_SWEEP_BUDGET_MS,
  DELETION_SWEEP_LIMIT,
  formatGraceDate,
  isMissingDeletionSchema,
  type CustomerEvent,
} from '@/lib/store-customer-privacy'

/**
 * Grace-period lifecycle for store-owner-initiated deletion: suspend, restore,
 * early purge and the daily sweep. NOT a `'use server'` module; callers
 * authorize first (project owner, or CRON_SECRET for the sweep). The customer's
 * own "delete my account" keeps using `anonymizeStoreCustomer` directly.
 */

type FailReason = 'migration_pending' | 'failed'

export type SuspendResult =
  | { ok: true; scheduledAt: string }
  | { ok: false; reason: 'not_found' | 'already_pending' | 'blocked' | FailReason }

export type RestoreResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'not_pending' | 'not_restorable' | FailReason }

async function recordEvent(projectId: string, customerId: string, event: CustomerEvent, actorUserId?: string | null) {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('store_customer_events').insert({
      project_id: projectId,
      customer_id: customerId,
      event,
      actor_user_id: actorUserId ?? null,
    })
    if (error) console.log('[v0] customer event not recorded:', event, error.code ?? 'unknown')
  } catch {
    console.log('[v0] customer event not recorded:', event)
  }
}

const epochSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000)

async function loadMailContext(projectId: string) {
  const admin = createAdminClient()
  const { data: project } = await admin
    .from('projects')
    .select('slug, name, owner_id, schema_data')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return null
  const schema = project.schema_data as { meta?: { language?: unknown } } | null
  return {
    ownerId: project.owner_id as string,
    storeName: (project.name as string) || (project.slug as string),
    storeSlug: project.slug as string,
    lang: resolveEmailLang(schema?.meta?.language),
    contactEmail: findContactEmail(project.schema_data) ?? '',
  }
}

/**
 * Notice mailed once per suspension cycle. The dedupe key is
 * `store-customer:<id>:suspended` plus the scheduled date, so a retry never mails
 * twice yet a later re-suspension of the same account still notifies. Never throws.
 */
export async function sendAccountSuspendedEmail(input: {
  projectId: string
  customerId: string
  to: string
  customerName: string
  scheduledAt: string
}): Promise<void> {
  try {
    if (!input.to) return
    const ctx = await loadMailContext(input.projectId)
    if (!ctx) return
    const claimed = await claimNotification({
      userId: ctx.ownerId,
      type: 'store_account_suspended',
      subject: 'Store account suspended email',
      body: null,
      dedupeKey: `store-customer:${input.customerId}:suspended:${epochSeconds(input.scheduledAt)}`,
    })
    if (!claimed) return
    const mail = renderStoreAccountSuspendedEmail({
      lang: ctx.lang,
      storeName: ctx.storeName,
      storeSlug: ctx.storeSlug,
      customerName: input.customerName,
      scheduledDate: formatGraceDate(input.scheduledAt, ctx.lang),
      contactEmail: ctx.contactEmail,
    })
    await sendTransactionalEmail({ to: input.to, ...mail })
  } catch (err) {
    console.log('[v0] account suspended email failed:', err instanceof Error ? err.message : 'unknown')
  }
}

export async function sendAccountRestoredEmail(input: {
  projectId: string
  customerId: string
  to: string
  customerName: string
  previousScheduledAt: string
}): Promise<void> {
  try {
    if (!input.to) return
    const ctx = await loadMailContext(input.projectId)
    if (!ctx) return
    const claimed = await claimNotification({
      userId: ctx.ownerId,
      type: 'store_account_restored',
      subject: 'Store account restored email',
      body: null,
      dedupeKey: `store-customer:${input.customerId}:restored:${epochSeconds(input.previousScheduledAt)}`,
    })
    if (!claimed) return
    const mail = renderStoreAccountRestoredEmail({
      lang: ctx.lang,
      storeName: ctx.storeName,
      storeSlug: ctx.storeSlug,
      customerName: input.customerName,
      contactEmail: ctx.contactEmail,
    })
    await sendTransactionalEmail({ to: input.to, ...mail })
  } catch (err) {
    console.log('[v0] account restored email failed:', err instanceof Error ? err.message : 'unknown')
  }
}

/** Puts an active account on a 30-day hold. Refuses while an order is in flight. */
export async function suspendStoreCustomer(input: {
  projectId: string
  customerId: string
  actorUserId?: string | null
}): Promise<SuspendResult> {
  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin
    .from('store_customers')
    .select('id, email, name, deleted_at, deletion_scheduled_at')
    .eq('project_id', input.projectId)
    .eq('id', input.customerId)
    .maybeSingle()
  if (readError) return { ok: false, reason: isMissingDeletionSchema(readError) ? 'migration_pending' : 'failed' }
  if (!existing || existing.deleted_at) return { ok: false, reason: 'not_found' }
  if (existing.deletion_scheduled_at) return { ok: false, reason: 'already_pending' }

  const blocked = await customerHasBlockingOrders(input.projectId, input.customerId)
  if (blocked === null) return { ok: false, reason: 'failed' }
  if (blocked) return { ok: false, reason: 'blocked' }

  const patch = buildSuspendPatch(new Date().toISOString())
  const { data: updated, error } = await admin
    .from('store_customers')
    .update(patch)
    .eq('project_id', input.projectId)
    .eq('id', input.customerId)
    .is('deleted_at', null)
    .is('deletion_scheduled_at', null)
    .select('id')
  if (error) return { ok: false, reason: isMissingDeletionSchema(error) ? 'migration_pending' : 'failed' }
  if (!updated || updated.length === 0) return { ok: false, reason: 'already_pending' }

  await recordEvent(input.projectId, input.customerId, 'suspended_by_owner', input.actorUserId)
  await sendAccountSuspendedEmail({
    projectId: input.projectId,
    customerId: input.customerId,
    to: String(existing.email ?? ''),
    customerName: String(existing.name ?? ''),
    scheduledAt: patch.deletion_scheduled_at,
  })
  return { ok: true, scheduledAt: patch.deletion_scheduled_at }
}

/** Undoes a suspension. Expired, wiped or never-suspended accounts are rejected by the UPDATE itself. */
export async function restoreStoreCustomer(input: {
  projectId: string
  customerId: string
  actorUserId?: string | null
}): Promise<RestoreResult> {
  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin
    .from('store_customers')
    .select('id, email, name, deleted_at, anonymized_at, deletion_scheduled_at')
    .eq('project_id', input.projectId)
    .eq('id', input.customerId)
    .maybeSingle()
  if (readError) return { ok: false, reason: isMissingDeletionSchema(readError) ? 'migration_pending' : 'failed' }
  if (!existing) return { ok: false, reason: 'not_found' }
  if (existing.deleted_at || existing.anonymized_at) return { ok: false, reason: 'not_restorable' }
  const scheduledAt = existing.deletion_scheduled_at as string | null
  if (!scheduledAt) return { ok: false, reason: 'not_pending' }

  const nowIso = new Date().toISOString()
  const { data: updated, error } = await admin
    .from('store_customers')
    .update(buildRestorePatch())
    .eq('project_id', input.projectId)
    .eq('id', input.customerId)
    .is('deleted_at', null)
    .is('anonymized_at', null)
    .not('deletion_scheduled_at', 'is', null)
    .gt('deletion_scheduled_at', nowIso)
    .select('id')
  if (error) return { ok: false, reason: isMissingDeletionSchema(error) ? 'migration_pending' : 'failed' }
  if (!updated || updated.length === 0) return { ok: false, reason: 'not_restorable' }

  await recordEvent(input.projectId, input.customerId, 'restored_by_owner', input.actorUserId)
  await sendAccountRestoredEmail({
    projectId: input.projectId,
    customerId: input.customerId,
    to: String(existing.email ?? ''),
    customerName: String(existing.name ?? ''),
    previousScheduledAt: scheduledAt,
  })
  return { ok: true }
}

/** Runs the shared anonymization right now for a suspended account. */
export async function purgeSuspendedCustomerNow(input: {
  projectId: string
  customerId: string
  actorUserId?: string | null
}) {
  const res = await anonymizeStoreCustomer({
    projectId: input.projectId,
    customerId: input.customerId,
    event: 'purged_early_by_owner',
    actorUserId: input.actorUserId,
    suspendedOnly: {},
  })
  if (res.ok) {
    await sendAccountDeletedEmail({
      projectId: input.projectId,
      customerId: input.customerId,
      to: res.previousEmail,
      customerName: res.previousName,
      byOwner: true,
    })
  }
  return res
}

export type SweepSummary = {
  due: number
  finalized: number
  postponed: number
  skipped: number
  failed: number
  /** True when the time budget ran out; the rest waits for the next run. */
  truncated: boolean
}

type DueRow = { id: string; project_id: string; deletion_scheduled_at: string }

/**
 * Daily sweep: wipes suspended accounts whose date has passed (at most `limit`
 * per run, oldest first). An account with an order in flight is pushed back by
 * 7 days instead. Safe to run concurrently: the wipe and the postponement are
 * both conditional UPDATEs, so exactly one run wins each account. One account
 * failing never stops the others.
 */
export async function finalizeDueCustomerDeletions(options?: {
  now?: Date
  limit?: number
  budgetMs?: number
}): Promise<SweepSummary> {
  const started = Date.now()
  const nowIso = (options?.now ?? new Date()).toISOString()
  const limit = options?.limit ?? DELETION_SWEEP_LIMIT
  const budgetMs = options?.budgetMs ?? DELETION_SWEEP_BUDGET_MS
  const summary: SweepSummary = { due: 0, finalized: 0, postponed: 0, skipped: 0, failed: 0, truncated: false }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('store_customers')
    .select('id, project_id, deletion_scheduled_at')
    .not('deletion_scheduled_at', 'is', null)
    .is('anonymized_at', null)
    .is('deleted_at', null)
    .lte('deletion_scheduled_at', nowIso)
    .order('deletion_scheduled_at', { ascending: true })
    .limit(limit)
  if (error) {
    // Before the migration there is nothing to sweep; any other error is retried tomorrow.
    if (!isMissingDeletionSchema(error)) console.log('[v0] deletion sweep read failed:', error.code ?? 'unknown')
    return summary
  }

  const rows = (data ?? []) as DueRow[]
  summary.due = rows.length

  for (const row of rows) {
    if (Date.now() - started > budgetMs) {
      summary.truncated = true
      break
    }
    try {
      const res = await anonymizeStoreCustomer({
        projectId: row.project_id,
        customerId: row.id,
        event: 'finalized_after_grace',
        suspendedOnly: { dueBefore: nowIso },
      })
      if (res.ok) {
        summary.finalized += 1
        await sendAccountDeletedEmail({
          projectId: row.project_id,
          customerId: row.id,
          to: res.previousEmail,
          customerName: res.previousName,
          byOwner: true,
        })
      } else if (res.reason === 'blocked') {
        const moved = await postpone(row)
        if (moved) summary.postponed += 1
        else summary.skipped += 1
      } else if (res.reason === 'failed' || res.reason === 'migration_pending') {
        summary.failed += 1
      } else {
        summary.skipped += 1
      }
    } catch (err) {
      summary.failed += 1
      console.log('[v0] deletion sweep item failed:', row.id, err instanceof Error ? err.message : 'unknown')
    }
  }
  return summary
}

async function postpone(row: DueRow): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('store_customers')
    .update({ deletion_scheduled_at: addDaysIso(row.deletion_scheduled_at, DELETION_POSTPONE_DAYS) })
    .eq('project_id', row.project_id)
    .eq('id', row.id)
    .eq('deletion_scheduled_at', row.deletion_scheduled_at)
    .is('anonymized_at', null)
    .is('deleted_at', null)
    .select('id')
  if (error || !data || data.length === 0) return false
  await recordEvent(row.project_id, row.id, 'deletion_postponed')
  return true
}
