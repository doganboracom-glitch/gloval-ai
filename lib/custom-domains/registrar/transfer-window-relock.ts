import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getDomainRegistrarProvider } from './provider'
import { isManageCapable } from './types'
import { isActiveAndUnexpired } from './nameserver-access'
import { recordDomainAuditEvent } from './audit'
import {
  getTransferWindowRecipient,
  sendTransferWindowNotice,
} from './transfer-window-notice'
import {
  updateOpenTransferWindow,
  type AdminClient,
  type DomainTransferWindow,
} from './transfer-window-store'
import {
  getRegistrarTransferState,
  nextPendingTransferRelockAt,
  TRANSFER_WINDOW_MAX_RELOCK_ATTEMPTS,
} from './transfer-window-logic'

const WINDOW_TABLE = 'domain_transfer_windows'

type ReminderCandidate = Pick<
  DomainTransferWindow,
  'id' | 'custom_domain_id' | 'domain' | 'user_id' | 'relock_at'
>

export type TransferWindowReminderResult = {
  sent: number
  failed: number
  skipped: number
}

export type TransferWindowRelockResult = {
  claimed: number
  relocked: number
  deferred: number
  cancelled: number
  failed: number
  retried: number
  storageUnavailable: boolean
}

async function releaseReminderClaim(admin: AdminClient, id: string, claimedAt: string): Promise<void> {
  try {
    await admin
      .from(WINDOW_TABLE)
      .update({ reminder_sent_at: null })
      .eq('id', id)
      .eq('reminder_sent_at', claimedAt)
  } catch {
    // A later cron run can safely retry with the same email idempotency key.
  }
}

export async function sendDueTransferWindowReminders(
  admin: AdminClient = createAdminClient(),
  nowMs = Date.now(),
): Promise<TransferWindowReminderResult> {
  const result: TransferWindowReminderResult = { sent: 0, failed: 0, skipped: 0 }
  const now = new Date(nowMs).toISOString()
  const dueBy = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data, error } = await admin
      .from(WINDOW_TABLE)
      .select('id, custom_domain_id, domain, user_id, relock_at')
      .eq('status', 'open')
      .is('reminder_sent_at', null)
      .gt('relock_at', now)
      .lte('relock_at', dueBy)
      .order('relock_at', { ascending: true })
      .limit(20)

    if (error) return { sent: 0, failed: 1, skipped: 0 }

    for (const candidate of (data ?? []) as ReminderCandidate[]) {
      if (!candidate.user_id || !candidate.custom_domain_id) {
        result.skipped += 1
        continue
      }

      const claimedAt = new Date(nowMs).toISOString()
      let claimed = false
      try {
        const claim = await admin
          .from(WINDOW_TABLE)
          .update({ reminder_sent_at: claimedAt })
          .eq('id', candidate.id)
          .eq('status', 'open')
          .is('reminder_sent_at', null)
          .gt('relock_at', now)
          .select('id')
          .maybeSingle()
        if (claim.error) {
          result.failed += 1
          continue
        }
        claimed = Boolean(claim.data)
      } catch {
        result.failed += 1
      }
      if (!claimed) {
        result.skipped += 1
        continue
      }

      const recipient = await getTransferWindowRecipient(admin, candidate.user_id)
      if (!recipient) {
        await releaseReminderClaim(admin, candidate.id, claimedAt)
        result.skipped += 1
        continue
      }

      const sent = await sendTransferWindowNotice({
        kind: 'reminder',
        email: recipient.email,
        lang: recipient.lang,
        domain: candidate.domain,
        customDomainId: candidate.custom_domain_id,
        windowId: candidate.id,
        relockAt: candidate.relock_at,
      })
      if (sent) {
        result.sent += 1
      } else {
        await releaseReminderClaim(admin, candidate.id, claimedAt)
        result.failed += 1
      }
    }
  } catch {
    result.failed += 1
  }

  return result
}

function auditSystemEvent(
  window: DomainTransferWindow,
  details: Parameters<typeof recordDomainAuditEvent>[0]['details'],
): Promise<void> {
  return recordDomainAuditEvent({
    userId: window.user_id,
    customDomainId: window.custom_domain_id,
    domain: window.domain,
    actor: 'system',
    eventType: 'transfer_lock_changed',
    details,
  })
}

async function closeWindow(
  admin: AdminClient,
  window: DomainTransferWindow,
  status: 'relocked' | 'cancelled' | 'failed',
  now: string,
  lastErrorCode: string | null = null,
): Promise<boolean> {
  const updated = await updateOpenTransferWindow(admin, window.id, {
    status,
    closed_at: now,
    last_error_code: lastErrorCode,
    relock_lease_until: null,
  })
  return updated.ok && updated.value
}

async function recordRelockFailure(
  admin: AdminClient,
  window: DomainTransferWindow,
  now: string,
  errorCode: string,
): Promise<'failed' | 'retried'> {
  const attempts = window.relock_attempts + 1
  const gaveUp = attempts >= TRANSFER_WINDOW_MAX_RELOCK_ATTEMPTS
  const update = await updateOpenTransferWindow(admin, window.id, {
    relock_attempts: attempts,
    last_error_code: errorCode,
    ...(gaveUp
      ? { status: 'failed' as const, closed_at: now, relock_lease_until: null }
      : {}),
  })

  await auditSystemEvent(window, {
    outcome: 'unconfirmed',
    locked: null,
    source: 'auto_relock',
  })

  if (gaveUp && update.ok && update.value) {
    console.error('[domain-transfer-relock] retry limit reached', errorCode)
    return 'failed'
  }
  return 'retried'
}

async function processWindow(
  admin: AdminClient,
  window: DomainTransferWindow,
  nowMs: number,
): Promise<'relocked' | 'deferred' | 'cancelled' | 'failed' | 'retried'> {
  const now = new Date(nowMs).toISOString()
  const registrar = getDomainRegistrarProvider()
  if (!isManageCapable(registrar)) return recordRelockFailure(admin, window, now, 'registrar_unavailable')

  let details
  try {
    details = await registrar.getManagedDetails(window.domain)
  } catch {
    return recordRelockFailure(admin, window, now, 'registrar_read_failed')
  }

  if (!details) {
    const cancelled = await closeWindow(admin, window, 'cancelled', now)
    if (cancelled) {
      await auditSystemEvent(window, { outcome: 'unchanged', source: 'auto_relock' })
      return 'cancelled'
    }
    return recordRelockFailure(admin, window, now, 'window_update_failed')
  }

  const transferState = getRegistrarTransferState(details.status)
  if (transferState === 'transferred_out') {
    const cancelled = await closeWindow(admin, window, 'cancelled', now)
    if (cancelled) {
      await auditSystemEvent(window, { outcome: 'unchanged', source: 'auto_relock' })
      return 'cancelled'
    }
    return recordRelockFailure(admin, window, now, 'window_update_failed')
  }

  if (transferState === 'pending_outgoing') {
    const nextRelockAt = nextPendingTransferRelockAt(window, nowMs)
    if (!nextRelockAt) {
      const failed = await closeWindow(admin, window, 'failed', now, 'pending_transfer_max_window')
      if (failed) {
        console.error('[domain-transfer-relock] pending transfer exceeded max window')
        await auditSystemEvent(window, {
          outcome: 'failed',
          locked: details.locked,
          source: 'auto_relock_deferred',
        })
        return 'failed'
      }
      return recordRelockFailure(admin, window, now, 'window_update_failed')
    }

    const deferred = await updateOpenTransferWindow(admin, window.id, {
      relock_at: nextRelockAt,
      last_error_code: null,
      relock_lease_until: null,
    })
    if (!deferred.ok || !deferred.value) return recordRelockFailure(admin, window, now, 'window_update_failed')
    await auditSystemEvent(window, {
      outcome: 'deferred',
      locked: details.locked,
      source: 'auto_relock_deferred',
    })
    return 'deferred'
  }

  if (transferState === 'unknown') return recordRelockFailure(admin, window, now, 'transfer_status_unknown')
  if (details.locked === null) return recordRelockFailure(admin, window, now, 'lock_status_unknown')

  if (details.locked === false && !isActiveAndUnexpired(details, nowMs)) {
    return recordRelockFailure(admin, window, now, 'domain_not_active')
  }

  let changed = false
  if (details.locked === false) {
    try {
      await registrar.changeLock(window.domain, true)
      const readback = await registrar.getManagedDetails(window.domain)
      if (readback?.locked !== true) return recordRelockFailure(admin, window, now, 'relock_readback_failed')
      changed = true
    } catch {
      return recordRelockFailure(admin, window, now, 'relock_provider_failed')
    }
  }

  const relocked = await closeWindow(admin, window, 'relocked', now)
  if (!relocked) return recordRelockFailure(admin, window, now, 'window_update_failed')

  await auditSystemEvent(window, {
    outcome: changed ? 'success' : 'unchanged',
    changed,
    locked: true,
    source: 'auto_relock',
  })

  if (window.user_id && window.custom_domain_id) {
    const recipient = await getTransferWindowRecipient(admin, window.user_id)
    if (recipient) {
      await sendTransferWindowNotice({
        kind: 'relocked',
        email: recipient.email,
        lang: recipient.lang,
        domain: window.domain,
        customDomainId: window.custom_domain_id,
        windowId: window.id,
        relockAt: window.relock_at,
      })
    }
  }

  return 'relocked'
}

export async function runDueTransferWindowRelocks(
  admin: AdminClient = createAdminClient(),
  nowMs = Date.now(),
): Promise<TransferWindowRelockResult> {
  let data: unknown
  try {
    const claim = await admin.rpc('claim_due_domain_transfer_windows', { p_limit: 20 })
    if (claim.error) {
      return {
        claimed: 0,
        relocked: 0,
        deferred: 0,
        cancelled: 0,
        failed: 0,
        retried: 0,
        storageUnavailable: true,
      }
    }
    data = claim.data
  } catch {
    return {
      claimed: 0,
      relocked: 0,
      deferred: 0,
      cancelled: 0,
      failed: 0,
      retried: 0,
      storageUnavailable: true,
    }
  }

  const windows = Array.isArray(data) ? (data as DomainTransferWindow[]) : []
  const summary: TransferWindowRelockResult = {
    claimed: windows.length,
    relocked: 0,
    deferred: 0,
    cancelled: 0,
    failed: 0,
    retried: 0,
    storageUnavailable: false,
  }

  for (const window of windows) {
    let outcome: Awaited<ReturnType<typeof processWindow>>
    try {
      outcome = await processWindow(admin, window, nowMs)
    } catch {
      outcome = await recordRelockFailure(admin, window, new Date(nowMs).toISOString(), 'relock_unexpected_error')
    }
    summary[outcome] += 1
  }

  return summary
}
