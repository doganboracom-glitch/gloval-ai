import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getMailProvider } from '@/lib/mail/provider'
import { syncMailAccessForUser } from '@/lib/mail/access-sync'
import { sendHandoverNotice } from './notice'
import { handoverRef, type NoticeLang, type ReleaseMode } from './notice-copy'
import { buildHandoverMeta, type HandoverForm } from './input'

/**
 * Server-side orchestration for the admin domain handover screen. All writes
 * go through the SECURITY DEFINER functions from scripts/086; this module
 * never updates custom_domains ownership directly.
 */

export type DomainCandidate = {
  id: string
  domain: string
  ownerId: string
  ownerEmail: string | null
  provider: string | null
  orderId: string | null
  status: string
  expiresAt: string | null
  heldAt: string | null
  holdHandoverId: string | null
  hasSite: boolean
  isPrimary: boolean
}

export type TargetUser = {
  id: string
  email: string
  confirmed: boolean
  banned: boolean
  deleted: boolean
  domainCount: number
}

export type HandoverEventRow = {
  id: string
  event: string
  actorEmail: string
  reason: string | null
  releaseMode: string | null
  consentNote: string | null
  createdAt: string
}

export type RpcResult = { ok: boolean; code?: string; [key: string]: unknown }

export function maskEmail(email: string | null | undefined): string {
  if (!email) return '—'
  const [local, host = ''] = email.split('@')
  const [name, ...tld] = host.split('.')
  return `${local.slice(0, 1)}***@${name.slice(0, 1)}***${tld.length ? `.${tld.join('.')}` : ''}`
}

async function getAuthUser(userId: string) {
  const { data } = await createAdminClient().auth.admin.getUserById(userId)
  return data?.user ?? null
}

export async function lookupDomain(domain: string): Promise<DomainCandidate | null> {
  const { data, error } = await createAdminClient()
    .from('custom_domains')
    .select(
      'id, domain, user_id, provider, order_id, status, expires_at, mail_transfer_hold_at, mail_transfer_hold_handover_id, website_project_id, is_primary',
    )
    .eq('domain', domain)
    .maybeSingle()
  if (error || !data) return null
  const row = data as Record<string, unknown>
  const owner = await getAuthUser(String(row.user_id))
  return {
    id: String(row.id),
    domain: String(row.domain),
    ownerId: String(row.user_id),
    ownerEmail: owner?.email ?? null,
    provider: (row.provider as string | null) ?? null,
    orderId: (row.order_id as string | null) ?? null,
    status: String(row.status),
    expiresAt: (row.expires_at as string | null) ?? null,
    heldAt: (row.mail_transfer_hold_at as string | null) ?? null,
    holdHandoverId: (row.mail_transfer_hold_handover_id as string | null) ?? null,
    hasSite: Boolean(row.website_project_id),
    isPrimary: Boolean(row.is_primary),
  }
}

/** Exact e-mail match only (no prefix or wildcard search). */
export async function lookupTargetByEmail(email: string): Promise<TargetUser | null> {
  const admin = createAdminClient()
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return null
    const users = data?.users ?? []
    const hit = users.find((u) => (u.email ?? '').trim().toLowerCase() === email)
    if (hit) {
      const { count } = await admin
        .from('custom_domains')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', hit.id)
      const bannedUntil = (hit as { banned_until?: string | null }).banned_until
      return {
        id: hit.id,
        email: hit.email ?? email,
        confirmed: Boolean(hit.email_confirmed_at),
        banned: Boolean(bannedUntil && new Date(bannedUntil).getTime() > Date.now()),
        deleted: Boolean((hit as { deleted_at?: string | null }).deleted_at),
        domainCount: count ?? 0,
      }
    }
    if (users.length < 1000) break
  }
  return null
}

/** Live Mailcow read. Null means "unknown" (provider unreachable or not configured). */
export async function countMailboxes(customDomainId: string): Promise<number | null> {
  try {
    const provider = getMailProvider()
    if (provider.id === 'mock') return null
    return (await provider.listMailboxes(customDomainId)).length
  } catch {
    return null
  }
}

export async function listHandoverEvents(customDomainId: string): Promise<HandoverEventRow[]> {
  const { data } = await createAdminClient()
    .from('domain_handover_events')
    .select('id, event, actor_email, reason, release_mode, consent_note, created_at')
    .eq('custom_domain_id', customDomainId)
    .order('created_at', { ascending: false })
    .limit(50)
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    event: String(r.event),
    actorEmail: String(r.actor_email),
    reason: (r.reason as string | null) ?? null,
    releaseMode: (r.release_mode as string | null) ?? null,
    consentNote: (r.consent_note as string | null) ?? null,
    createdAt: String(r.created_at),
  }))
}

async function rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await createAdminClient().rpc(name, args)
  if (error || !data || typeof data !== 'object') return { ok: false, code: 'rpc_failed' }
  return data as RpcResult
}

async function logEvent(handoverId: string, event: string, actorEmail: string, meta: Record<string, unknown> = {}) {
  await createAdminClient().rpc('log_domain_handover_event', {
    p_handover_id: handoverId,
    p_event: event,
    p_actor_email: actorEmail,
    p_meta: meta,
  })
}

async function noticeLang(userId: string): Promise<NoticeLang> {
  const { data } = await createAdminClient().from('profiles').select('language').eq('id', userId).maybeSingle()
  return (data as { language?: string } | null)?.language === 'en' ? 'en' : 'tr'
}

async function notify(
  kind: 'former_owner' | 'new_owner' | 'released',
  handoverId: string,
  userId: string,
  domain: string,
  actorEmail: string,
  mode?: ReleaseMode,
) {
  const user = await getAuthUser(userId)
  if (!user?.email) {
    await logEvent(handoverId, 'notice_failed', actorEmail, { kind, reason: 'no_email' })
    return
  }
  const ok = await sendHandoverNotice({
    kind,
    handoverId,
    to: user.email,
    lang: await noticeLang(userId),
    domain,
    ref: handoverRef(handoverId),
    mode,
  })
  await logEvent(handoverId, ok ? 'notice_sent' : 'notice_failed', actorEmail, { kind })
}

export async function runHandover(candidate: DomainCandidate, target: TargetUser, form: HandoverForm, actorEmail: string) {
  const mailboxCount = await countMailboxes(candidate.id)
  const result = await rpc('handover_registrar_domain', {
    p_custom_domain_id: candidate.id,
    p_expected_from_user_id: candidate.ownerId,
    p_to_user_id: target.id,
    p_to_email: target.email,
    p_actor_email: actorEmail,
    p_reason: form.reason,
    p_idempotency_key: form.idempotencyKey,
    p_meta: buildHandoverMeta(form, mailboxCount),
  })
  if (!result.ok) return result

  const handoverId = String(result.handover_id)
  if (!result.replayed) {
    // The domain now belongs to the target; the held row is closed (never opened) on the provider.
    await syncMailAccessForUser(target.id).catch(() => undefined)
    await notify('former_owner', handoverId, candidate.ownerId, candidate.domain, actorEmail)
    await notify('new_owner', handoverId, target.id, candidate.domain, actorEmail)
  }
  return result
}

export async function runReleaseRequest(
  domainId: string,
  handoverId: string,
  actorEmail: string,
  mode: ReleaseMode,
  consentNote: string | null,
) {
  return rpc('request_domain_mail_hold_release', {
    p_custom_domain_id: domainId,
    p_handover_id: handoverId,
    p_actor_email: actorEmail,
    p_release_mode: mode,
    p_consent_note: consentNote,
  })
}

export async function runRelease(
  candidate: DomainCandidate,
  actorEmail: string,
  confirmDomain: string,
  mode: ReleaseMode,
  consentNote: string | null,
  idempotencyKey: string,
) {
  if (!candidate.holdHandoverId) return { ok: false, code: 'not_held' } as RpcResult

  // The count is re-read right before the call so the DB sees a fresh, authoritative number.
  const meta: Record<string, unknown> = {}
  if (mode === 'empty_handover') {
    const count = await countMailboxes(candidate.id)
    if (count !== null) {
      meta.mailbox_count = count
      meta.mailbox_count_checked_at = new Date().toISOString()
    }
  } else {
    meta.mailbox_count = await countMailboxes(candidate.id)
  }

  const result = await rpc('release_domain_mail_transfer_hold', {
    p_custom_domain_id: candidate.id,
    p_handover_id: candidate.holdHandoverId,
    p_actor_email: actorEmail,
    p_confirm_domain: confirmDomain,
    p_ack: true,
    p_release_mode: mode,
    p_consent_note: consentNote,
    p_idempotency_key: idempotencyKey,
    p_meta: meta,
  })
  if (!result.ok) return result

  if (!result.replayed) {
    await syncMailAccessForUser(candidate.ownerId).catch(() => undefined)
    await notify('released', candidate.holdHandoverId, candidate.ownerId, candidate.domain, actorEmail, mode)
  }
  return result
}
