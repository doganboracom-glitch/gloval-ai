'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/mail/admin-guard'
import { DEFAULT_CURSOR_AURA, effectsSchema, parseCursorAuraInput, type CursorAuraConfig } from '@/lib/cursor-aura'
import { triggerMailAccessSync } from '@/lib/mail/access-trigger'
import {
  notifyAccountReactivated,
  notifyAccountSuspended,
  recordNotification,
  sendTransactionalEmail,
} from '@/lib/notify'
import { sendTicketReplyEmail } from '@/lib/support/ticket-reply-mail'
import { TICKET_STATUSES, type TicketStatus } from '@/lib/support/constants'
import { headers } from 'next/headers'
import {
  MAX_TYPE_CHANGE_NOTE,
  MIN_TYPE_CHANGE_NOTE,
  columnsForKind,
  isSiteKind,
  siteKindOf,
  siteTypeBlocker,
  type SelectableSiteKind,
  type SiteKind,
  type SiteTypeBlocker,
} from '@/lib/site-kind'
import type { UserStatus } from './queries'

/**
 * Admin server actions (mutations).
 *
 * Every action calls `requireAdmin()` FIRST, before touching the service-role
 * client — the guard 404s non-admins, so a forged form submission from a normal
 * user can never reach these writes. Mutations run through the service-role
 * client because they must act across tenants; that client bypasses RLS, which
 * is why the admin gate is non-negotiable.
 *
 * Actions return a discriminated `{ ok }` result rather than throwing, so
 * client components can surface a message without a try/catch.
 */

export type AdminActionResult = { ok: true } | { ok: false; error: string }

const ADMIN_PASSWORD_MIN_LENGTH = 8

/* --------------------------------- sites --------------------------------- */

export type SiteTypeImpact = {
  name: string
  published: boolean
  from: SiteKind
  to: SelectableSiteKind
  products: number
  orders: number
  hasStoreSections: boolean
  blocker: SiteTypeBlocker | null
}

type SiteTypeContext =
  | { ok: false; error: string }
  | {
      ok: true
      admin: ReturnType<typeof createAdminClient>
      project: { id: string; name: string; published: boolean; project_type: string | null; commerce_mode: string | null }
      impact: SiteTypeImpact
    }

async function loadSiteTypeContext(projectId: string, kind: unknown): Promise<SiteTypeContext> {
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) return { ok: false, error: 'invalid_site' }
  if (!isSiteKind(kind)) return { ok: false, error: 'invalid_type' }

  const admin = createAdminClient()
  const { data: project } = await admin
    .from('projects')
    .select('id, name, published, project_type, commerce_mode, schema_data')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return { ok: false, error: 'invalid_site' }

  const [{ count: products }, { count: orders }] = await Promise.all([
    admin.from('ecommerce_products').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    admin.from('ecommerce_orders').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
  ])
  const sections = (project.schema_data as { sections?: Array<{ type?: string }> } | null)?.sections ?? []
  const counts = { products: products ?? 0, orders: orders ?? 0 }
  const from = siteKindOf(project)
  return {
    ok: true,
    admin,
    project,
    impact: {
      name: project.name as string,
      published: Boolean(project.published),
      from,
      to: kind,
      ...counts,
      hasStoreSections: sections.some((s) => s.type === 'products' || s.type === 'categories'),
      blocker: siteTypeBlocker(from, kind, counts),
    },
  }
}

/** Read-only impact summary shown in the confirmation dialog before a switch. */
export async function previewSiteTypeChange(
  projectId: string,
  kind: SelectableSiteKind,
): Promise<{ ok: true; impact: SiteTypeImpact } | { ok: false; error: string }> {
  await requireAdmin()
  const ctx = await loadSiteTypeContext(projectId, kind)
  return ctx.ok ? { ok: true, impact: ctx.impact } : ctx
}

/**
 * Explicitly switches a site between corporate and e-commerce (the catalog is an editor feature, see `lib/catalog-feature.ts`). Saves
 * never change the type; this is the only path. It refuses switches that would
 * orphan a catalog or orders, requires a reason, and writes an audit row
 * (`site_type_changes`); if that row cannot be written the switch is undone.
 */
export async function setSiteType(
  projectId: string,
  kind: SelectableSiteKind,
  note: string,
): Promise<AdminActionResult> {
  const { email: actorEmail, userId: actorId } = await requireAdmin()
  const reason = typeof note === 'string' ? note.trim() : ''
  if (reason.length < MIN_TYPE_CHANGE_NOTE) return { ok: false, error: 'note_required' }

  const ctx = await loadSiteTypeContext(projectId, kind)
  if (!ctx.ok) return ctx
  const { admin, project, impact } = ctx
  if (impact.from === impact.to) return { ok: false, error: 'no_change' }
  if (impact.blocker) return { ok: false, error: impact.blocker }

  const next = columnsForKind(kind)
  const { error } = await admin.from('projects').update(next).eq('id', projectId)
  if (error) return { ok: false, error: 'update_failed' }

  const { error: auditError } = await admin.from('site_type_changes').insert({
    project_id: projectId,
    actor_id: actorId ?? null,
    actor_email: actorEmail,
    from_type: project.project_type ?? 'corporate',
    from_mode: project.commerce_mode ?? 'none',
    to_type: next.project_type,
    to_mode: next.commerce_mode,
    note: reason.slice(0, MAX_TYPE_CHANGE_NOTE),
  })
  if (auditError) {
    await admin
      .from('projects')
      .update({ project_type: project.project_type ?? 'corporate', commerce_mode: project.commerce_mode ?? 'none' })
      .eq('id', projectId)
    return { ok: false, error: 'audit_failed' }
  }

  revalidatePath('/admin/sites')
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * Admin-only: turns the per-site cursor aura effect on/off or reconfigures it.
 * Input is validated (hex colours, bounded numbers) before anything is stored.
 * The value is written to the draft AND to the live published snapshot, so the
 * switch takes effect without the owner republishing. Passing `null` removes it.
 */
export async function setSiteCursorAura(projectId: string, raw: unknown): Promise<AdminActionResult> {
  await requireAdmin()
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) return { ok: false, error: 'invalid_site' }

  let config: CursorAuraConfig | null = null
  if (raw !== null) {
    config = parseCursorAuraInput(raw)
    if (!config) return { ok: false, error: 'invalid_aura' }
  }

  const admin = createAdminClient()
  const { data: project } = await admin
    .from('projects')
    .select('id, slug, published_version_id, schema_data')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return { ok: false, error: 'invalid_site' }

  const withEffects = (schema: unknown) => {
    const { effects: _previous, ...rest } = (schema && typeof schema === 'object' ? schema : {}) as Record<string, unknown>
    return config ? { ...rest, effects: { cursorAura: config } } : rest
  }

  const { error } = await admin
    .from('projects')
    .update({ schema_data: withEffects(project.schema_data) })
    .eq('id', projectId)
  if (error) return { ok: false, error: 'update_failed' }

  if (project.published_version_id) {
    const { data: version } = await admin
      .from('project_versions')
      .select('schema_data')
      .eq('id', project.published_version_id)
      .maybeSingle()
    if (version) {
      const { error: versionError } = await admin
        .from('project_versions')
        .update({ schema_data: withEffects(version.schema_data) })
        .eq('id', project.published_version_id)
      if (versionError) return { ok: false, error: 'update_failed' }
    }
  }

  revalidatePath('/admin/sites')
  if (project.slug) revalidatePath(`/site/${project.slug}`, 'layout')
  return { ok: true }
}

/** Current aura config for the admin dialog (draft value, defaults when unset). */
export async function getSiteCursorAura(projectId: string): Promise<{ ok: true; config: CursorAuraConfig } | { ok: false; error: string }> {
  await requireAdmin()
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) return { ok: false, error: 'invalid_site' }
  const admin = createAdminClient()
  const { data: project } = await admin.from('projects').select('schema_data').eq('id', projectId).maybeSingle()
  if (!project) return { ok: false, error: 'invalid_site' }
  const stored = effectsSchema.safeParse((project.schema_data as { effects?: unknown } | null)?.effects)
  const aura = stored.success ? stored.data.cursorAura : undefined
  return { ok: true, config: aura ?? DEFAULT_CURSOR_AURA }
}

/* --------------------------------- users --------------------------------- */

export async function deleteUser(userId: string): Promise<AdminActionResult> {
  const { email: actorEmail } = await requireAdmin()
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false, error: 'invalid_user' }

  const admin = createAdminClient()
  const { data: target, error: targetError } = await admin
    .from('profiles')
    .select('id, email')
    .eq('id', userId)
    .maybeSingle()
  if (targetError || !target) return { ok: false, error: 'user_not_found' }
  if (target.email && target.email.toLowerCase() === actorEmail.toLowerCase()) {
    return { ok: false, error: 'cannot_delete_self' }
  }

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { ok: false, error: 'delete_failed' }

  revalidatePath('/admin/users')
  revalidatePath('/admin')
  return { ok: true }
}

export async function sendUserPasswordReset(userId: string): Promise<AdminActionResult> {
  const { email: actorEmail } = await requireAdmin()
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false, error: 'invalid_user' }

  const admin = createAdminClient()
  const { data: target } = await admin.from('profiles').select('id, email, full_name').eq('id', userId).maybeSingle()
  if (!target?.email) return { ok: false, error: 'user_not_found' }

  const requestHeaders = await headers()
  const origin = requestHeaders.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gloval.ai'
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: target.email,
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent('/auth/reset-password')}` },
  })
  const actionLink = linkData?.properties?.action_link
  if (linkError || !actionLink) return { ok: false, error: 'reset_email_failed' }

  const name = target.full_name?.trim() || 'GLOVAL AI kullanıcısı'
  const sent = await sendTransactionalEmail({
    to: target.email,
    subject: 'GLOVAL AI – Şifrenizi Belirleyin',
    text: `Merhaba ${name},\n\nGLOVAL AI hesabınız için yeni bir şifre belirlemek üzere bu bağlantıyı kullanın:\n${actionLink}\n\nBağlantı güvenlik nedeniyle 1 saat geçerlidir. Bu işlemi siz talep etmediyseniz bu e-postayı dikkate almayabilirsiniz.`,
    html: `<!doctype html><html><body style="margin:0;background:#0b0b0f;padding:32px 0;font-family:Arial,sans-serif;color:#e7e7ea"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="480" style="max-width:480px;background:#141419;border:1px solid #26262e;border-radius:16px"><tr><td style="padding:32px"><div style="color:#b794ff;font-size:18px;font-weight:700;letter-spacing:.14em">GLOVAL AI</div><h1 style="color:#fff;font-size:22px">Şifrenizi belirleyin</h1><p>Merhaba ${name},</p><p>Hesabınız için yeni bir şifre belirlemek üzere aşağıdaki butona tıklayın.</p><p><a href="${actionLink}" style="display:inline-block;background:#8b5cf6;color:#fff;padding:13px 20px;border-radius:9px;text-decoration:none;font-weight:700">Şifremi Belirle</a></p><p style="color:#999;font-size:13px">Bu bağlantı 1 saat geçerlidir. Bu işlemi siz talep etmediyseniz bu e-postayı dikkate almayabilirsiniz.</p><p>GLOVAL AI</p></td></tr></table></td></tr></table></body></html>`,
  })
  if (!sent) return { ok: false, error: 'reset_email_failed' }

  await recordNotification({ userId, channel: 'email', type: 'password_reset', subject: 'Şifre belirleme bağlantısı gönderildi', body: `Admin: ${actorEmail}`, status: 'sent' })
  return { ok: true }
}

export async function setUserPassword(input: {
  userId: string
  password: string
  passwordConfirmation: string
}): Promise<AdminActionResult> {
  await requireAdmin()
  if (!input.userId || !/^[0-9a-f-]{36}$/i.test(input.userId)) return { ok: false, error: 'invalid_user' }
  if (input.password.length < ADMIN_PASSWORD_MIN_LENGTH) return { ok: false, error: 'password_too_short' }
  if (input.password !== input.passwordConfirmation) return { ok: false, error: 'password_mismatch' }

  const admin = createAdminClient()
  const { data: target } = await admin.from('profiles').select('id').eq('id', input.userId).maybeSingle()
  if (!target) return { ok: false, error: 'user_not_found' }

  const { error } = await admin.auth.admin.updateUserById(input.userId, { password: input.password })
  if (error) return { ok: false, error: 'password_update_failed' }
  revalidatePath(`/admin/users/${input.userId}`)
  return { ok: true }
}

/** Activate / suspend a user. Suspension is a soft flag on `profiles.status`. */
export async function setUserStatus(
  userId: string,
  status: UserStatus,
): Promise<AdminActionResult> {
  const { email } = await requireAdmin()
  if (status !== 'active' && status !== 'suspended') {
    return { ok: false, error: 'invalid_status' }
  }
  const admin = createAdminClient()

  // Grab the target's email up front so we can warn them by email.
  const { data: profile } = await admin
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle()
  const targetEmail = (profile?.email as string) ?? null

  const { error } = await admin.from('profiles').update({ status }).eq('id', userId)
  if (error) return { ok: false, error: 'update_failed' }

  // Warn the user by email AND leave an audit trail in the notification log so
  // the status change is visible in the admin "Bildirimler" screen. Both steps
  // are best-effort inside the helper and never throw.
  if (status === 'suspended') {
    await notifyAccountSuspended({ userId, email: targetEmail, actorEmail: email })
  } else {
    await notifyAccountReactivated({ userId, email: targetEmail, actorEmail: email })
  }

  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${userId}`)
  revalidatePath('/admin')
  return { ok: true }
}

/* -------------------------------- credits -------------------------------- */

/**
 * Grant (or deduct) AI credits. Delegates to the `admin_adjust_credits` RPC,
 * which appends to the ledger (balance = Σ amount), refuses to push a balance
 * below zero, requires a reason, writes the immutable audit row and dedupes on
 * `idempotencyKey` — all in one transaction.
 */
export async function grantCredits(input: {
  userId: string
  amount: number
  reason?: string
  idempotencyKey?: string
}): Promise<AdminActionResult> {
  const { email, userId: adminId } = await requireAdmin()

  const amount = Math.trunc(input.amount)
  if (!Number.isFinite(amount) || amount === 0) return { ok: false, error: 'invalid_amount' }
  if (Math.abs(amount) > 1_000_000) return { ok: false, error: 'amount_too_large' }
  const reason = input.reason?.trim() ?? ''
  if (!reason) return { ok: false, error: 'reason_required' }
  if (!UUID_RE.test(input.userId)) return { ok: false, error: 'invalid_user' }

  const result = await callPackageRpc('admin_adjust_credits', {
    p_admin_email: email,
    p_admin_id: adminId,
    p_user_id: input.userId,
    p_amount: amount,
    p_reason: reason,
    p_idem: idemKey(input.idempotencyKey, 'credit', input.userId, amount, reason),
  })
  if (!result.ok) {
    await logFailedPackageAction({ email, adminId, userId: input.userId, action: 'credit_adjust', field: 'ai_credits', newValue: amount, reason, error: result.error })
    return result
  }

  if (!result.duplicate) {
    const admin = createAdminClient()
    await admin.from('notification_logs').insert({
      user_id: input.userId,
      channel: 'system',
      type: 'credits_granted',
      subject: amount > 0 ? `${amount} AI kredisi tanımlandı` : `${Math.abs(amount)} AI kredisi düşüldü`,
      body: reason,
      status: 'sent',
    })
  }

  revalidateUserPackage(input.userId)
  revalidatePath('/admin/credits')
  return { ok: true }
}

/* -------------------------------- packages -------------------------------- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RpcResult = { ok: true; duplicate: boolean; data: Record<string, unknown> } | { ok: false; error: string }

/** Idempotency key: the client's per-form UUID when valid, else a deterministic fingerprint. */
function idemKey(provided: string | undefined, ...parts: Array<string | number | null>): string {
  if (provided && provided.length >= 16 && provided.length <= 100) return provided
  return ['auto', ...parts.map((p) => String(p ?? ''))].join(':').slice(0, 200)
}

async function callPackageRpc(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc(fn, args)
  if (error || !data) return { ok: false, error: 'rpc_failed' }
  const res = data as Record<string, unknown>
  if (res.ok !== true) return { ok: false, error: String(res.error ?? 'rpc_failed') }
  return { ok: true, duplicate: res.duplicate === true, data: res }
}

/** Failed/blocked attempts are audited too (the table is append-only). Best-effort. */
async function logFailedPackageAction(input: {
  email: string
  adminId: string
  userId: string
  action: 'plan_change' | 'credit_adjust' | 'limit_override' | 'period_change'
  field: string
  newValue: unknown
  reason: string | null
  error: string
  status?: 'failed' | 'blocked'
}) {
  try {
    const admin = createAdminClient()
    await admin.from('admin_package_audit').insert({
      admin_email: input.email,
      admin_user_id: input.adminId,
      target_user_id: input.userId,
      action: input.action,
      field: input.field,
      new_value: input.newValue ?? null,
      reason: input.reason,
      status: input.status ?? 'failed',
      error: input.error,
    })
  } catch {
    // Audit logging must never mask the original failure.
  }
}

function revalidateUserPackage(userId: string) {
  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${userId}`)
  revalidatePath('/admin/subscriptions')
  revalidatePath('/admin')
  revalidatePath('/dashboard', 'layout')
  revalidatePath('/billing')
}

/**
 * Change a user's plan IMMEDIATELY (the subscription model has no scheduled
 * downgrade). This only rewrites our own subscription row — NO charge, refund
 * or provider-side change is made. When the user has a live iyzico
 * subscription, the provider would keep billing the old plan, so we refuse
 * unless the admin explicitly acknowledges that no payment sync happens.
 */
export async function changeUserPlan(input: {
  userId: string
  planId: string
  reason?: string
  acknowledgeNoPaymentSync?: boolean
  idempotencyKey?: string
}): Promise<AdminActionResult> {
  const { email, userId: adminId } = await requireAdmin()
  if (!UUID_RE.test(input.userId) || !UUID_RE.test(input.planId)) return { ok: false, error: 'invalid_user' }
  const baseReason = input.reason?.trim() ?? ''

  // The live-PSP-subscription check runs inside the RPC, under the same row
  // lock as the update, so it cannot race with a webhook or another request.
  const result = await callPackageRpc('admin_change_user_plan', {
    p_admin_email: email,
    p_admin_id: adminId,
    p_user_id: input.userId,
    p_plan_id: input.planId,
    p_reason: baseReason || null,
    p_idem: idemKey(input.idempotencyKey, 'plan', input.userId, input.planId),
    p_ack_no_payment_sync: input.acknowledgeNoPaymentSync === true,
  })
  if (!result.ok) {
    // payment_sync_required is already audited ('blocked') by the RPC itself.
    if (result.error !== 'payment_sync_required') {
      await logFailedPackageAction({ email, adminId, userId: input.userId, action: 'plan_change', field: 'plan', newValue: input.planId, reason: baseReason || null, error: result.error })
    }
    return result
  }

  if (!result.duplicate) {
    const admin = createAdminClient()
    await admin.from('notification_logs').insert({
      user_id: input.userId,
      channel: 'system',
      type: 'plan_changed',
      subject: `Paketiniz ${String(result.data.plan_name ?? '')} olarak güncellendi`,
      body: baseReason || null,
      status: 'sent',
    })
    await triggerMailAccessSync(input.userId, 'admin_plan_changed')
  }
  revalidateUserPackage(input.userId)
  return { ok: true }
}

/** Per-user publish-limit exception. `siteLimit: null` clears it. Plan definition is untouched. */
export async function setUserSiteLimitOverride(input: {
  userId: string
  siteLimit: number | null
  expiresAt?: string | null
  reason?: string
  idempotencyKey?: string
}): Promise<AdminActionResult> {
  const { email, userId: adminId } = await requireAdmin()
  if (!UUID_RE.test(input.userId)) return { ok: false, error: 'invalid_user' }
  const reason = input.reason?.trim() ?? ''
  if (input.siteLimit !== null) {
    if (!Number.isInteger(input.siteLimit) || input.siteLimit < 0 || input.siteLimit > 100) return { ok: false, error: 'invalid_limit' }
    if (!reason) return { ok: false, error: 'reason_required' }
  }
  let expires: string | null = null
  if (input.expiresAt) {
    const d = new Date(input.expiresAt)
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'invalid_expiry' }
    expires = d.toISOString()
  }

  const result = await callPackageRpc('admin_set_limit_override', {
    p_admin_email: email,
    p_admin_id: adminId,
    p_user_id: input.userId,
    p_site_limit: input.siteLimit,
    p_expires: expires,
    p_reason: reason || null,
    p_idem: idemKey(input.idempotencyKey, 'limit', input.userId, input.siteLimit, expires),
  })
  if (!result.ok) {
    await logFailedPackageAction({ email, adminId, userId: input.userId, action: 'limit_override', field: 'site_limit', newValue: input.siteLimit, reason: reason || null, error: result.error })
    return result
  }
  revalidateUserPackage(input.userId)
  return { ok: true }
}

/** Move the subscription's own period end (our record only; the PSP schedule is not touched). */
export async function setUserPeriodEnd(input: {
  userId: string
  periodEnd: string | null
  reason?: string
  idempotencyKey?: string
}): Promise<AdminActionResult> {
  const { email, userId: adminId } = await requireAdmin()
  if (!UUID_RE.test(input.userId)) return { ok: false, error: 'invalid_user' }
  const reason = input.reason?.trim() ?? ''
  if (!reason) return { ok: false, error: 'reason_required' }
  let end: string | null = null
  if (input.periodEnd) {
    const d = new Date(input.periodEnd)
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'invalid_period_end' }
    end = d.toISOString()
  }

  const result = await callPackageRpc('admin_set_period_end', {
    p_admin_email: email,
    p_admin_id: adminId,
    p_user_id: input.userId,
    p_period_end: end,
    p_reason: reason,
    p_idem: idemKey(input.idempotencyKey, 'period', input.userId, end),
  })
  if (!result.ok) {
    await logFailedPackageAction({ email, adminId, userId: input.userId, action: 'period_change', field: 'current_period_end', newValue: end, reason, error: result.error })
    return result
  }
  await triggerMailAccessSync(input.userId, 'admin_period_end_changed')
  revalidateUserPackage(input.userId)
  return { ok: true }
}

/* -------------------------------- support -------------------------------- */

/** Post an admin reply to a ticket and bump the ticket's updated_at. */
export async function replyToTicket(input: {
  ticketId: string
  body: string
}): Promise<AdminActionResult> {
  const { email } = await requireAdmin()
  const body = input.body?.trim()
  if (!body) return { ok: false, error: 'empty_body' }

  const admin = createAdminClient()

  const { data: ticket } = await admin
    .from('support_tickets')
    .select('id, user_id, subject, contact_email, contact_name, ticket_number')
    .eq('id', input.ticketId)
    .maybeSingle()
  if (!ticket) return { ok: false, error: 'ticket_not_found' }

  const { error } = await admin.from('support_ticket_messages').insert({
    ticket_id: input.ticketId,
    author_type: 'admin',
    author_email: email,
    body,
  })
  if (error) return { ok: false, error: 'insert_failed' }

  await admin
    .from('support_tickets')
    .update({ status: 'answered', updated_at: new Date().toISOString() })
    .eq('id', input.ticketId)
    .in('status', ['open', 'in_progress', 'waiting_user', 'answered'])

  try {
    const { subject: subjectLine, sent } = await sendTicketReplyEmail(
      {
        id: ticket.id as string,
        user_id: (ticket.user_id as string | null) ?? null,
        subject: ticket.subject as string,
        ticket_number: ticket.ticket_number as string,
        contact_email: (ticket.contact_email as string | null) ?? null,
        contact_name: (ticket.contact_name as string | null) ?? null,
      },
      body,
    )

    await admin.from('notification_logs').insert({
      user_id: ticket.user_id,
      channel: 'email',
      type: 'ticket_reply',
      subject: subjectLine,
      body,
      status: sent ? 'sent' : 'failed',
    })
  } catch (error) {
    console.log('[v0] ticket reply email failed:', error)
  }

  revalidatePath('/admin/support')
  revalidatePath(`/admin/support/${input.ticketId}`)
  revalidatePath('/admin')
  return { ok: true }
}

/** Change a ticket's status (open / pending / closed). */
export async function setTicketStatus(
  ticketId: string,
  status: TicketStatus,
): Promise<AdminActionResult> {
  await requireAdmin()
  if (!TICKET_STATUSES.includes(status)) {
    return { ok: false, error: 'invalid_status' }
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from('support_tickets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', ticketId)
  if (error) return { ok: false, error: 'update_failed' }

  revalidatePath('/admin/support')
  revalidatePath(`/admin/support/${ticketId}`)
  revalidatePath('/admin')
  return { ok: true }
}

/* ------------------------------ subscriptions ----------------------------- */

/**
 * Cancel a user's subscription at period end. This is the safe, reversible
 * admin action; immediate hard-cancel is intentionally not exposed here to
 * avoid an operator accidentally cutting off paid access mid-period.
 */
export async function cancelUserSubscription(
  subscriptionId: string,
): Promise<AdminActionResult> {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from('billing_subscriptions')
    .update({ cancel_at_period_end: true })
    .eq('id', subscriptionId)
  if (error) return { ok: false, error: 'update_failed' }

  revalidatePath('/admin/billing')
  revalidatePath('/admin')
  return { ok: true }
}
