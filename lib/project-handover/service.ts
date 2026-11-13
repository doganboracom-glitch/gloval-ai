import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendProjectHandoverNotice } from './notice'
import { projectHandoverRef, type NoticeLang } from './notice-copy'
import type { ProjectHandoverForm } from './input'

/**
 * Server-side orchestration for the admin site handover screen. The ownership move is a single
 * SECURITY DEFINER function (scripts/134); this module never updates `projects` directly.
 */

export type TargetSnapshot = {
  found: boolean
  id?: string
  email?: string
  confirmed?: boolean
  active?: boolean
  has_profile?: boolean
  plan_code?: string
  site_limit?: number
  ecommerce_site_limit?: number
  published_count?: number
  ecommerce_published_count?: number
}

export type RawPreview = {
  found: boolean
  project?: { id: string; name: string; type: string; published: boolean; slug: string | null }
  from?: { id: string; email: string | null }
  target?: TargetSnapshot
  counts?: { products: number; orders: number }
  domains?: Array<{ domain: string; owner_id: string; status: string }>
  entitlements?: Array<{ code: string; name: string; status: string }>
  quota_would_exceed?: boolean
  warnings: string[]
  blockers: string[]
}

export type RpcResult = { ok: boolean; state?: string; [key: string]: unknown }

export function maskEmail(email: string | null | undefined): string {
  if (!email) return '—'
  const [local, host = ''] = email.split('@')
  const [name, ...tld] = host.split('.')
  return `${local.slice(0, 1)}***@${name.slice(0, 1)}***${tld.length ? `.${tld.join('.')}` : ''}`
}

export async function fetchPreview(projectId: string, toEmail: string): Promise<RawPreview | null> {
  const { data, error } = await createAdminClient().rpc('admin_project_handover_preview', {
    p_project_id: projectId,
    p_to_email: toEmail,
  })
  if (error || !data || typeof data !== 'object') return null
  const raw = data as Partial<RawPreview>
  return { ...raw, found: Boolean(raw.found), warnings: raw.warnings ?? [], blockers: raw.blockers ?? [] }
}

async function userEmail(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().auth.admin.getUserById(userId)
  return data?.user?.email ?? null
}

async function noticeLang(userId: string): Promise<NoticeLang> {
  const { data } = await createAdminClient().from('profiles').select('language').eq('id', userId).maybeSingle()
  return (data as { language?: string } | null)?.language === 'en' ? 'en' : 'tr'
}

async function notify(kind: 'former_owner' | 'new_owner', handoverId: string, userId: string, siteName: string) {
  const to = await userEmail(userId)
  if (!to) return false
  return sendProjectHandoverNotice({
    kind,
    handoverId,
    to,
    lang: await noticeLang(userId),
    siteName,
    ref: projectHandoverRef(handoverId),
  }).catch(() => false)
}

export async function runProjectHandover(
  form: ProjectHandoverForm,
  toUserId: string,
  siteName: string,
  actorEmail: string,
): Promise<RpcResult & { noticesSent?: { former: boolean; target: boolean } }> {
  const { data, error } = await createAdminClient().rpc('admin_handover_project', {
    p_project_id: form.projectId,
    p_expected_from_user_id: form.fromUserId,
    p_to_user_id: toUserId,
    p_actor_email: actorEmail,
    p_reason: form.reason,
    p_idempotency_key: form.idempotencyKey,
    p_force_quota: form.forceQuota,
  })
  if (error || !data || typeof data !== 'object') return { ok: false, state: 'rpc_failed' }
  const result = data as RpcResult
  if (!result.ok || result.replayed) return result

  const handoverId = String(result.handover_id)
  const [former, target] = await Promise.all([
    notify('former_owner', handoverId, form.fromUserId, siteName),
    notify('new_owner', handoverId, toUserId, siteName),
  ])
  return { ...result, noticesSent: { former, target } }
}

export async function listProjectHandoverEvents(projectId: string) {
  const { data } = await createAdminClient()
    .from('project_handover_events')
    .select('id, event, actor_email, reason, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(20)
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    event: String(r.event),
    actorEmail: String(r.actor_email),
    reason: (r.reason as string | null) ?? null,
    createdAt: String(r.created_at),
  }))
}

export type ProjectHandoverEventRow = Awaited<ReturnType<typeof listProjectHandoverEvents>>[number]
