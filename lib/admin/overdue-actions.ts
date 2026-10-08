'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/mail/admin-guard'
import { settleSubscriptionManually } from './overdue-settlement'

/**
 * Server actions for the "Ödeme bekleyenler" screen. `requireAdmin()` runs
 * FIRST in every action (404 for non-admins) and writes go through the
 * service-role client, like the other admin actions.
 */

export type OverdueActionResult =
  | { ok: true; providerManaged?: boolean; auditRecorded?: boolean }
  | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OUTCOMES = ['contacted', 'unreachable', 'promised'] as const

function revalidateOverdue(userId?: string) {
  revalidatePath('/admin/overdue')
  revalidatePath('/admin/billing')
  revalidatePath('/admin/users')
  if (userId) revalidatePath(`/admin/users/${userId}`)
  revalidatePath('/billing')
  revalidatePath('/dashboard', 'layout')
}

export async function addOverdueContactNote(input: {
  subscriptionId: string
  note: string
  outcome?: (typeof OUTCOMES)[number] | null
  promisedFor?: string | null
}): Promise<OverdueActionResult> {
  const actor = await requireAdmin()
  if (!UUID_RE.test(input.subscriptionId)) return { ok: false, error: 'invalid_subscription' }
  const note = input.note?.trim() ?? ''
  if (!note) return { ok: false, error: 'note_required' }
  if (note.length > 1000) return { ok: false, error: 'note_too_long' }
  const outcome = input.outcome ?? null
  if (outcome !== null && !OUTCOMES.includes(outcome)) return { ok: false, error: 'invalid_outcome' }
  let promisedFor: string | null = null
  if (outcome === 'promised' && input.promisedFor) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.promisedFor) || Number.isNaN(new Date(input.promisedFor).getTime())) {
      return { ok: false, error: 'invalid_date' }
    }
    promisedFor = input.promisedFor
  }

  const admin = createAdminClient()
  const { data: sub } = await admin.from('billing_subscriptions').select('id, user_id').eq('id', input.subscriptionId).maybeSingle()
  if (!sub) return { ok: false, error: 'subscription_not_found' }

  const { error } = await admin.from('admin_overdue_contact_notes').insert({
    subscription_id: sub.id,
    user_id: sub.user_id,
    admin_email: actor.email,
    admin_user_id: actor.userId,
    outcome,
    promised_for: promisedFor,
    note,
  })
  if (error) return { ok: false, error: 'insert_failed' }
  revalidatePath('/admin/overdue')
  return { ok: true }
}

export async function markSubscriptionPaid(input: {
  subscriptionId: string
  reason: string
  idempotencyKey?: string
}): Promise<OverdueActionResult> {
  const actor = await requireAdmin()
  if (!UUID_RE.test(input.subscriptionId)) return { ok: false, error: 'invalid_subscription' }
  const result = await settleSubscriptionManually({
    actor,
    kind: 'mark_paid',
    subscriptionId: input.subscriptionId,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
  })
  if (!result.ok) return result
  revalidateOverdue()
  return { ok: true, providerManaged: result.providerManaged, auditRecorded: result.auditRecorded }
}

export async function grantGiftTime(input: {
  subscriptionId: string
  months: number
  reason: string
  idempotencyKey?: string
}): Promise<OverdueActionResult> {
  const actor = await requireAdmin()
  if (!UUID_RE.test(input.subscriptionId)) return { ok: false, error: 'invalid_subscription' }
  const result = await settleSubscriptionManually({
    actor,
    kind: 'gift',
    subscriptionId: input.subscriptionId,
    reason: input.reason,
    months: input.months,
    idempotencyKey: input.idempotencyKey,
  })
  if (!result.ok) return result
  revalidateOverdue()
  return { ok: true, providerManaged: result.providerManaged, auditRecorded: result.auditRecorded }
}
