import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/mail/admin-guard'
import {
  classifyOverdue,
  compareOverdue,
  daysOverdue,
  isProviderManaged,
  type OverdueReason,
} from './overdue-logic'

/** Admin-only read layer for the "Ödeme bekleyenler" screen (see `requireAdmin`). */

export const OVERDUE_PAGE_SIZE = 20

export type OverdueNote = {
  id: string
  createdAt: string
  adminEmail: string
  outcome: string | null
  promisedFor: string | null
  note: string
}

export type OverdueAuditEntry = {
  id: string
  createdAt: string
  adminEmail: string
  action: string
  months: number | null
  amountCents: number
  currency: string
  prevStatus: string | null
  newPeriodEnd: string | null
  reason: string
}

export type OverdueRow = {
  subscriptionId: string
  userId: string
  email: string | null
  fullName: string | null
  phone: string | null
  planName: string
  planCode: string
  interval: string
  priceCents: number
  currency: string
  provider: string
  providerManaged: boolean
  status: string
  reason: OverdueReason
  currentPeriodEnd: string | null
  graceEndsAt: string | null
  daysOverdue: number
  siteState: 'active' | 'suspended' | 'none'
  siteCount: number
  mailStatus: 'active' | 'grace' | 'suspended' | null
  notes: OverdueNote[]
  audit: OverdueAuditEntry[]
}

export type OverdueFilters = {
  reason?: OverdueReason | 'all'
  plan?: string
  noContact?: boolean
  q?: string
  page?: number
}

export type OverdueList = {
  rows: OverdueRow[]
  total: number
  page: number
  pageCount: number
  planOptions: { code: string; name: string }[]
}

type PlanJoin = { name?: string; code?: string; price_cents?: number; currency?: string; interval?: string }

const MAIL_RANK = { active: 0, grace: 1, suspended: 2 } as const

export async function listOverdue(filters: OverdueFilters = {}, now: Date = new Date()): Promise<OverdueList> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data } = await admin
    .from('billing_subscriptions')
    .select(
      'id, user_id, status, provider, current_period_end, grace_period_ends_at, cancel_at_period_end, suspension_reason, suspended_project_ids, billing_plans!billing_subscriptions_plan_id_fkey(name, code, price_cents, currency, interval)',
    )
    .in('status', ['past_due', 'suspended', 'active', 'trialing'])
    .or(`status.in.(past_due,suspended),current_period_end.lte.${now.toISOString()}`)

  type Candidate = {
    sub: NonNullable<typeof data>[number]
    plan: PlanJoin | null
    reason: OverdueReason
  }
  const candidates: Candidate[] = []
  for (const sub of data ?? []) {
    const joined = sub.billing_plans as PlanJoin | PlanJoin[] | null
    const plan = Array.isArray(joined) ? (joined[0] ?? null) : joined
    const reason = classifyOverdue(
      {
        status: sub.status as string,
        currentPeriodEnd: (sub.current_period_end as string) ?? null,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        suspensionReason: (sub.suspension_reason as string) ?? null,
        planPriceCents: plan?.price_cents ?? 0,
      },
      now,
    )
    if (reason) candidates.push({ sub, plan, reason })
  }

  const planOptions = [...new Map(candidates.map((c) => [c.plan?.code ?? '', c.plan?.name ?? '—'])).entries()]
    .filter(([code]) => code)
    .map(([code, name]) => ({ code, name }))

  const userIds = [...new Set(candidates.map((c) => c.sub.user_id as string))]
  const subIds = candidates.map((c) => c.sub.id as string)

  const [profiles, notes, audit, domains, projects] = await Promise.all([
    userIds.length ? admin.from('profiles').select('id, email, full_name').in('id', userIds) : { data: [] },
    subIds.length
      ? admin
          .from('admin_overdue_contact_notes')
          .select('id, subscription_id, created_at, admin_email, outcome, promised_for, note')
          .in('subscription_id', subIds)
          .order('created_at', { ascending: false })
      : { data: [] },
    userIds.length
      ? admin
          .from('admin_overdue_audit')
          .select('id, target_user_id, created_at, admin_email, action, months, amount_cents, currency, prev_status, new_period_end, reason')
          .in('target_user_id', userIds)
          .order('created_at', { ascending: false })
      : { data: [] },
    userIds.length
      ? admin.from('custom_domains').select('user_id, mail_access_status').in('user_id', userIds)
      : { data: [] },
    userIds.length
      ? admin.from('projects').select('owner_id').in('owner_id', userIds).eq('published', true)
      : { data: [] },
  ])

  const profileById = new Map((profiles.data ?? []).map((p) => [p.id as string, p]))
  const notesBySub = new Map<string, OverdueNote[]>()
  for (const n of notes.data ?? []) {
    const list = notesBySub.get(n.subscription_id as string) ?? []
    list.push({
      id: n.id as string,
      createdAt: n.created_at as string,
      adminEmail: n.admin_email as string,
      outcome: (n.outcome as string) ?? null,
      promisedFor: (n.promised_for as string) ?? null,
      note: n.note as string,
    })
    notesBySub.set(n.subscription_id as string, list)
  }
  const auditByUser = new Map<string, OverdueAuditEntry[]>()
  for (const a of audit.data ?? []) {
    const list = auditByUser.get(a.target_user_id as string) ?? []
    list.push({
      id: a.id as string,
      createdAt: a.created_at as string,
      adminEmail: a.admin_email as string,
      action: a.action as string,
      months: (a.months as number) ?? null,
      amountCents: (a.amount_cents as number) ?? 0,
      currency: (a.currency as string) ?? 'TRY',
      prevStatus: (a.prev_status as string) ?? null,
      newPeriodEnd: (a.new_period_end as string) ?? null,
      reason: a.reason as string,
    })
    auditByUser.set(a.target_user_id as string, list)
  }
  const mailByUser = new Map<string, 'active' | 'grace' | 'suspended'>()
  for (const d of domains.data ?? []) {
    const status = d.mail_access_status as keyof typeof MAIL_RANK
    if (!(status in MAIL_RANK)) continue
    const current = mailByUser.get(d.user_id as string)
    if (!current || MAIL_RANK[status] > MAIL_RANK[current]) mailByUser.set(d.user_id as string, status)
  }
  const publishedByUser = new Map<string, number>()
  for (const p of projects.data ?? []) {
    publishedByUser.set(p.owner_id as string, (publishedByUser.get(p.owner_id as string) ?? 0) + 1)
  }

  const needle = (filters.q ?? '').trim().toLowerCase()
  const rows: OverdueRow[] = []
  for (const { sub, plan, reason } of candidates) {
    const userId = sub.user_id as string
    const profile = profileById.get(userId)
    const email = (profile?.email as string) ?? null
    const fullName = (profile?.full_name as string) ?? null
    const planCode = plan?.code ?? ''
    const notesForSub = notesBySub.get(sub.id as string) ?? []

    if (filters.reason && filters.reason !== 'all' && reason !== filters.reason) continue
    if (filters.plan && planCode !== filters.plan) continue
    if (filters.noContact && notesForSub.length > 0) continue
    if (needle && !(email ?? '').toLowerCase().includes(needle) && !(fullName ?? '').toLowerCase().includes(needle)) continue

    const suspendedIds = (sub.suspended_project_ids as string[] | null) ?? []
    const published = publishedByUser.get(userId) ?? 0
    rows.push({
      subscriptionId: sub.id as string,
      userId,
      email,
      fullName,
      phone: null,
      planName: plan?.name ?? '—',
      planCode,
      interval: plan?.interval ?? 'month',
      priceCents: plan?.price_cents ?? 0,
      currency: plan?.currency ?? 'TRY',
      provider: sub.provider as string,
      providerManaged: isProviderManaged(sub.provider as string),
      status: sub.status as string,
      reason,
      currentPeriodEnd: (sub.current_period_end as string) ?? null,
      graceEndsAt: (sub.grace_period_ends_at as string) ?? null,
      daysOverdue: daysOverdue((sub.current_period_end as string) ?? null, now),
      siteState: suspendedIds.length > 0 ? 'suspended' : published > 0 ? 'active' : 'none',
      siteCount: suspendedIds.length > 0 ? suspendedIds.length : published,
      mailStatus: mailByUser.get(userId) ?? null,
      notes: notesForSub.slice(0, 20),
      audit: (auditByUser.get(userId) ?? []).slice(0, 10),
    })
  }

  rows.sort(compareOverdue)
  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / OVERDUE_PAGE_SIZE))
  const page = Math.min(Math.max(1, Math.floor(filters.page ?? 1)), pageCount)
  const pageRows = rows.slice((page - 1) * OVERDUE_PAGE_SIZE, page * OVERDUE_PAGE_SIZE)

  // Phone numbers live on the auth user, so they are resolved for the visible page only.
  await Promise.all(
    pageRows.map(async (row) => {
      try {
        const { data: auth } = await admin.auth.admin.getUserById(row.userId)
        const meta = (auth?.user?.user_metadata ?? {}) as Record<string, unknown>
        const phone = auth?.user?.phone || (typeof meta.phone === 'string' ? meta.phone : '')
        row.phone = phone ? String(phone) : null
      } catch {
        row.phone = null
      }
    }),
  )

  return { rows: pageRows, total, page, pageCount, planOptions }
}
