'use server'

import { getAdminUser } from '@/lib/mail/admin-guard'
import {
  fetchPreview,
  listProjectHandoverEvents,
  maskEmail,
  runProjectHandover,
  type ProjectHandoverEventRow,
} from './service'
import {
  BLOCKER_LABELS,
  WARNING_LABELS,
  isUuid,
  normalizeEmail,
  projectHandoverErrorMessage,
  validateProjectHandoverForm,
} from './input'

export type ProjectHandoverPreview = {
  projectId: string
  name: string
  type: string
  published: boolean
  slug: string | null
  fromUserId: string
  ownerMasked: string
  target: {
    found: boolean
    masked: string | null
    planCode: string | null
    siteLimit: number | null
    publishedCount: number | null
  }
  counts: { products: number; orders: number }
  domains: Array<{ domain: string; status: string }>
  entitlements: Array<{ code: string; name: string; status: string }>
  quotaWouldExceed: boolean
  warnings: Array<{ code: string; label: string }>
  blockers: Array<{ code: string; label: string }>
  canHandover: boolean
  events: ProjectHandoverEventRow[]
  idempotencyKey: string
}

export type ProjectActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? Record<never, never> : { data: T }))
  | { ok: false; error: string; code?: string }

const FORBIDDEN = { ok: false as const, error: projectHandoverErrorMessage('forbidden'), code: 'forbidden' }

export async function previewProjectHandoverAction(input: {
  projectId: string
  toEmail: string
}): Promise<ProjectActionResult<ProjectHandoverPreview>> {
  const admin = await getAdminUser()
  if (!admin) return FORBIDDEN

  const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : ''
  if (!isUuid(projectId)) return { ok: false, error: projectHandoverErrorMessage('bad_project'), code: 'bad_project' }

  const raw = await fetchPreview(projectId, normalizeEmail(input.toEmail))
  if (!raw) return { ok: false, error: projectHandoverErrorMessage('rpc_failed'), code: 'rpc_failed' }
  if (!raw.found || !raw.project || !raw.from) {
    return { ok: false, error: projectHandoverErrorMessage('not_found'), code: 'not_found' }
  }

  const target = raw.target
  const blockers = raw.blockers.map((code) => ({ code, label: BLOCKER_LABELS[code] ?? code }))
  return {
    ok: true,
    data: {
      projectId: raw.project.id,
      name: raw.project.name,
      type: raw.project.type,
      published: raw.project.published,
      slug: raw.project.slug,
      fromUserId: raw.from.id,
      ownerMasked: maskEmail(raw.from.email),
      target: {
        found: Boolean(target?.found),
        masked: target?.found ? maskEmail(target.email) : null,
        planCode: target?.plan_code ?? null,
        siteLimit: target?.site_limit ?? null,
        publishedCount: target?.published_count ?? null,
      },
      counts: raw.counts ?? { products: 0, orders: 0 },
      domains: (raw.domains ?? []).map((d) => ({ domain: d.domain, status: d.status })),
      entitlements: raw.entitlements ?? [],
      quotaWouldExceed: Boolean(raw.quota_would_exceed),
      warnings: raw.warnings.map((code) => ({ code, label: WARNING_LABELS[code] ?? code })),
      blockers,
      canHandover: Boolean(target?.found) && blockers.length === 0,
      events: await listProjectHandoverEvents(raw.project.id),
      idempotencyKey: crypto.randomUUID(),
    },
  }
}

export async function handoverProjectAction(
  rawForm: Record<string, unknown>,
): Promise<ProjectActionResult<{ handoverId: string; replayed: boolean; noticesSent: boolean }>> {
  const admin = await getAdminUser()
  if (!admin) return FORBIDDEN

  const parsed = validateProjectHandoverForm(rawForm)
  if (!parsed.ok) return { ok: false, error: projectHandoverErrorMessage(parsed.code), code: parsed.code }
  const { form } = parsed

  // The target id and site name are re-resolved server-side; the client only sends an e-mail.
  const fresh = await fetchPreview(form.projectId, form.toEmail)
  if (!fresh?.found || !fresh.project) {
    return { ok: false, error: projectHandoverErrorMessage('not_found'), code: 'not_found' }
  }
  const toUserId = fresh.target?.found ? fresh.target.id : undefined
  if (!toUserId || !isUuid(toUserId)) {
    return { ok: false, error: projectHandoverErrorMessage('target_invalid'), code: 'target_invalid' }
  }

  const result = await runProjectHandover(form, toUserId, fresh.project.name, admin.email)
  if (!result.ok) {
    const code = String(result.state ?? 'rpc_failed')
    return { ok: false, error: projectHandoverErrorMessage(code), code }
  }
  return {
    ok: true,
    data: {
      handoverId: String(result.handover_id),
      replayed: Boolean(result.replayed),
      noticesSent: Boolean(result.noticesSent?.former && result.noticesSent?.target),
    },
  }
}
