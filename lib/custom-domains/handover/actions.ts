'use server'

import { getAdminUser } from '@/lib/mail/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  countMailboxes,
  listHandoverEvents,
  lookupDomain,
  lookupTargetByEmail,
  maskEmail,
  runHandover,
  runRelease,
  runReleaseRequest,
  type HandoverEventRow,
} from './service'
import {
  handoverErrorMessage,
  normalizeDomainInput,
  normalizeEmailInput,
  validateHandoverForm,
  validateReleaseForm,
} from './input'

export type PrereqCheck = { key: string; label: string; ok: boolean | null; detail?: string }

export type HandoverPreview = {
  domainId: string
  domain: string
  ownerMasked: string
  held: boolean
  holdHandoverId: string | null
  hasSite: boolean
  isPrimary: boolean
  mailboxCount: number | null
  target: { masked: string; email: string } | null
  checks: PrereqCheck[]
  canHandover: boolean
  events: HandoverEventRow[]
  idempotencyKey: string
}

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? Record<never, never> : { data: T }))
  | { ok: false; error: string; code?: string }

const FORBIDDEN = { ok: false as const, error: handoverErrorMessage('forbidden'), code: 'forbidden' }

async function openJobCounts(domain: string, ownOrderId: string | null) {
  const admin = createAdminClient()
  const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const count = async (table: string, terminal: string[], excludeId?: string | null) => {
    let q = admin
      .from(table)
      .select('id, status, created_at')
      .eq('domain', domain)
      .not('status', 'in', `(${terminal.join(',')})`)
    if (excludeId) q = q.neq('id', excludeId)
    const { data } = await q
    return ((data ?? []) as Array<{ status: string; created_at: string }>).filter(
      (r) => !(r.status === 'pending_payment' && r.created_at <= staleBefore),
    ).length
  }
  const [orders, transfers, renewals] = await Promise.all([
    count('domain_orders', ['active', 'registration_failed', 'failed', 'cancelled'], ownOrderId),
    count('domain_transfers', ['completed', 'failed', 'cancelled']),
    count('domain_renewals', ['completed', 'failed', 'cancelled']),
  ])
  return { orders, transfers, renewals }
}

export async function previewHandoverAction(input: {
  domain: string
  toEmail: string
}): Promise<ActionResult<HandoverPreview>> {
  const admin = await getAdminUser()
  if (!admin) return FORBIDDEN

  const domain = normalizeDomainInput(input.domain)
  if (!domain.includes('.')) return { ok: false, error: handoverErrorMessage('bad_domain'), code: 'bad_domain' }
  const candidate = await lookupDomain(domain)
  if (!candidate) return { ok: false, error: handoverErrorMessage('domain_not_found'), code: 'domain_not_found' }

  const email = normalizeEmailInput(input.toEmail)
  const target = email ? await lookupTargetByEmail(email) : null
  const [jobs, mailboxCount, events] = await Promise.all([
    openJobCounts(candidate.domain, candidate.orderId),
    countMailboxes(candidate.id),
    listHandoverEvents(candidate.id),
  ])

  const expired = candidate.expiresAt ? new Date(candidate.expiresAt).getTime() < Date.now() : false
  const checks: PrereqCheck[] = [
    { key: 'registrar', label: 'Registrar alan adı', ok: candidate.provider === 'domainnameapi' },
    { key: 'order', label: 'Sipariş kaydı var', ok: Boolean(candidate.orderId) },
    { key: 'active', label: 'Alan adı aktif', ok: candidate.status === 'active' },
    { key: 'expiry', label: 'Süresi dolmamış', ok: !expired },
    {
      key: 'jobs',
      label: 'Açık sipariş/transfer/yenileme yok',
      ok: jobs.orders + jobs.transfers + jobs.renewals === 0,
      detail: `sipariş ${jobs.orders}, transfer ${jobs.transfers}, yenileme ${jobs.renewals}`,
    },
    { key: 'not_held', label: 'Karantinada değil', ok: !candidate.heldAt },
    {
      key: 'target',
      label: 'Hedef kullanıcı uygun',
      ok: target ? target.confirmed && !target.banned && !target.deleted && target.id !== candidate.ownerId : false,
      detail: target ? undefined : email ? 'Kullanıcı bulunamadı' : 'E-posta girilmedi',
    },
  ]

  return {
    ok: true,
    data: {
      domainId: candidate.id,
      domain: candidate.domain,
      ownerMasked: maskEmail(candidate.ownerEmail),
      held: Boolean(candidate.heldAt),
      holdHandoverId: candidate.holdHandoverId,
      hasSite: candidate.hasSite,
      isPrimary: candidate.isPrimary,
      mailboxCount,
      target: target ? { masked: maskEmail(target.email), email: target.email } : null,
      checks,
      canHandover: checks.every((c) => c.ok === true),
      events,
      idempotencyKey: crypto.randomUUID(),
    },
  }
}

export async function handoverAction(raw: Record<string, unknown>): Promise<ActionResult<{ handoverId: string; replayed: boolean }>> {
  const admin = await getAdminUser()
  if (!admin) return FORBIDDEN

  const parsed = validateHandoverForm(raw)
  if (!parsed.ok) return { ok: false, error: handoverErrorMessage(parsed.code), code: parsed.code }
  const { form } = parsed

  const candidate = await lookupDomain(form.domain)
  if (!candidate) return { ok: false, error: handoverErrorMessage('domain_not_found'), code: 'domain_not_found' }
  const target = await lookupTargetByEmail(form.toEmail)
  if (!target) return { ok: false, error: handoverErrorMessage('target_not_found'), code: 'target_not_found' }

  const result = await runHandover(candidate, target, form, admin.email)
  if (!result.ok) {
    const code = String(result.code ?? 'rpc_failed')
    return { ok: false, error: handoverErrorMessage(code), code }
  }
  return { ok: true, data: { handoverId: String(result.handover_id), replayed: Boolean(result.replayed) } }
}

/** Fresh live Mailcow read for the release screen ("Mailcow'u yeniden oku"). */
export async function recheckMailboxesAction(domain: string): Promise<ActionResult<{ count: number | null }>> {
  const admin = await getAdminUser()
  if (!admin) return FORBIDDEN
  const candidate = await lookupDomain(normalizeDomainInput(domain))
  if (!candidate) return { ok: false, error: handoverErrorMessage('domain_not_found'), code: 'domain_not_found' }
  return { ok: true, data: { count: await countMailboxes(candidate.id) } }
}

export async function requestReleaseAction(raw: Record<string, unknown>): Promise<ActionResult> {
  const admin = await getAdminUser()
  if (!admin) return FORBIDDEN
  const domain = normalizeDomainInput(raw.domain)
  const candidate = await lookupDomain(domain)
  if (!candidate?.holdHandoverId) return { ok: false, error: handoverErrorMessage('not_held'), code: 'not_held' }
  const parsed = validateReleaseForm(raw, domain)
  if (!parsed.ok) return { ok: false, error: handoverErrorMessage(parsed.code), code: parsed.code }
  const result = await runReleaseRequest(candidate.id, candidate.holdHandoverId, admin.email, parsed.mode, parsed.consentNote)
  if (!result.ok) {
    const code = String(result.code ?? 'rpc_failed')
    return { ok: false, error: handoverErrorMessage(code), code }
  }
  return { ok: true } as ActionResult
}

export async function releaseAction(raw: Record<string, unknown>): Promise<ActionResult> {
  const admin = await getAdminUser()
  if (!admin) return FORBIDDEN
  const domain = normalizeDomainInput(raw.domain)
  const candidate = await lookupDomain(domain)
  if (!candidate) return { ok: false, error: handoverErrorMessage('domain_not_found'), code: 'domain_not_found' }
  const parsed = validateReleaseForm(raw, domain)
  if (!parsed.ok) return { ok: false, error: handoverErrorMessage(parsed.code), code: parsed.code }
  const result = await runRelease(candidate, admin.email, domain, parsed.mode, parsed.consentNote, parsed.idempotencyKey)
  if (!result.ok) {
    const code = String(result.code ?? 'rpc_failed')
    return { ok: false, error: handoverErrorMessage(code), code }
  }
  return { ok: true } as ActionResult
}
