import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/mail/admin-guard'
import { listAllDomains } from '@/lib/custom-domains/service'
import type { CustomDomain } from '@/lib/custom-domains/types'

/**
 * Read layer for the admin back office.
 *
 * Every export here is admin-only: each function calls `requireAdmin()` first,
 * which 404s non-admins (see `lib/mail/admin-guard.ts`). Reads use the
 * service-role client so they can see across ALL tenants — normal RLS scopes
 * rows to the owner, which is exactly what we must bypass for a back office.
 * Because the service-role client ignores RLS, `requireAdmin()` is the ONLY
 * thing standing between these reads and every user's data; never export a
 * variant that skips it.
 *
 * `import 'server-only'` guarantees this module (and the service-role key it
 * pulls in) can never be bundled into a client component.
 */

export type UserStatus = 'active' | 'suspended'

export type AdminUser = {
  id: string
  email: string | null
  fullName: string | null
  status: UserStatus
  createdAt: string
  siteCount: number
  planName: string | null
  planCode: string | null
  subscriptionStatus: string | null
  periodStart: string | null
  periodEnd: string | null
  creditBalance: number
}

export type AdminPackagePlan = {
  id: string
  code: string
  name: string
  priceCents: number
  currency: string
  interval: string
  productCategory: string | null
}

export type AdminPackageSubscription = {
  id: string
  planId: string
  planCode: string
  planName: string
  status: string
  provider: string
  providerRef: string | null
  currentPeriodStart: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  pendingPlanId: string | null
}

export type AdminPackageTransaction = {
  id: string
  kind: string
  amountCents: number
  currency: string
  status: string
  provider: string
  description: string | null
  createdAt: string
}

export type AdminPackageAudit = {
  id: string
  createdAt: string
  adminEmail: string
  action: string
  field: string | null
  oldValue: unknown
  newValue: unknown
  reason: string | null
  status: string
  error: string | null
}

export type AdminLimitOverride = {
  siteLimit: number
  expiresAt: string | null
  reason: string | null
  updatedBy: string
  updatedAt: string
}

export type AdminPackageDetail = {
  subscription: AdminPackageSubscription | null
  plans: AdminPackagePlan[]
  transactions: AdminPackageTransaction[]
  audit: AdminPackageAudit[]
  override: AdminLimitOverride | null
  publishedCount: number
}

export type AdminSite = {
  id: string
  name: string
  ownerId: string
  ownerEmail: string | null
  slug: string | null
  status: string
  projectType: string
  published: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AdminSubscription = {
  id: string
  userId: string
  userEmail: string | null
  planName: string
  planCode: string
  priceCents: number
  currency: string
  interval: string
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  createdAt: string
}

export type AdminCreditTx = {
  id: string
  userId: string
  userEmail: string | null
  kind: string
  amount: number
  reason: string | null
  adminEmail: string | null
  createdAt: string
}

export type AdminCreditUser = {
  userId: string
  email: string | null
  fullName: string | null
  balance: number
  gifted: number
}

export type AdminTicket = {
  id: string
  userId: string
  userEmail: string | null
  subject: string
  ticketNumber: string
  department: string
  service: string | null
  projectName: string | null
  status: 'open' | 'in_progress' | 'waiting_user' | 'answered' | 'resolved'
  priority: 'low' | 'normal' | 'high'
  createdAt: string
  updatedAt: string
  messageCount: number
}

export type AdminTicketAttachment = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
}

export type AdminTicketMessage = {
  id: string
  ticketId: string
  authorType: 'user' | 'admin'
  authorEmail: string | null
  body: string
  createdAt: string
  attachments: AdminTicketAttachment[]
}

export type AdminNotification = {
  id: string
  userId: string | null
  userEmail: string | null
  channel: string
  type: string
  subject: string | null
  status: string
  createdAt: string
}

export type AdminOverview = {
  userCount: number
  activeUserCount: number
  siteCount: number
  publishedSiteCount: number
  activeSubscriptions: number
  monthlyRecurringCents: number
  openTickets: number
  giftedCredits: number
  recentUsers: AdminUser[]
  recentSites: AdminSite[]
}

/** Map of userId -> email/name, built from a single profiles fetch. */
async function buildUserLookup(
  admin: ReturnType<typeof createAdminClient>,
): Promise<Map<string, { email: string | null; fullName: string | null }>> {
  const { data } = await admin.from('profiles').select('id, email, full_name')
  const map = new Map<string, { email: string | null; fullName: string | null }>()
  for (const row of data ?? []) {
    map.set(row.id as string, {
      email: (row.email as string) ?? null,
      fullName: (row.full_name as string) ?? null,
    })
  }
  return map
}

/** Sum of the AI credit ledger, grouped by user. Balance = Σ amount. */
async function buildCreditLookup(
  admin: ReturnType<typeof createAdminClient>,
): Promise<Map<string, { balance: number; gifted: number }>> {
  const { data } = await admin
    .from('ai_credit_transactions')
    .select('user_id, kind, amount')
  const map = new Map<string, { balance: number; gifted: number }>()
  for (const row of data ?? []) {
    const uid = row.user_id as string
    const amount = (row.amount as number) ?? 0
    const entry = map.get(uid) ?? { balance: 0, gifted: 0 }
    entry.balance += amount
    if (row.kind === 'gift') entry.gifted += amount
    map.set(uid, entry)
  }
  return map
}

/** All users with derived site count, plan and credit balance. */
export async function listUsers(): Promise<AdminUser[]> {
  await requireAdmin()
  const admin = createAdminClient()

  const [{ data: profiles }, credits] = await Promise.all([
    admin
      .from('profiles')
      .select('id, email, full_name, status, created_at')
      .order('created_at', { ascending: false }),
    buildCreditLookup(admin),
  ])

  // Site counts per owner (one grouped pass).
  const { data: projects } = await admin.from('projects').select('owner_id')
  const siteCounts = new Map<string, number>()
  for (const p of projects ?? []) {
    const owner = p.owner_id as string
    siteCounts.set(owner, (siteCounts.get(owner) ?? 0) + 1)
  }

  // Latest live subscription per user (same status set as getPlanCodeForUser).
  const { data: subs } = await admin
    .from('billing_subscriptions')
    .select(
      'user_id, status, current_period_start, current_period_end, created_at, billing_plans!billing_subscriptions_plan_id_fkey(name, code)',
    )
    .in('status', ['trialing', 'active', 'past_due'])
    .order('created_at', { ascending: false })
  const subByUser = new Map<string, PackageSummary>()
  for (const s of subs ?? []) {
    const uid = s.user_id as string
    if (subByUser.has(uid)) continue
    const plan = s.billing_plans as { name?: string; code?: string } | { name?: string; code?: string }[] | null
    const p = Array.isArray(plan) ? plan[0] : plan
    subByUser.set(uid, {
      planName: p?.name ?? null,
      planCode: p?.code ?? null,
      subscriptionStatus: (s.status as string) ?? null,
      periodStart: (s.current_period_start as string) ?? null,
      periodEnd: (s.current_period_end as string) ?? null,
    })
  }

  return (profiles ?? []).map((p) => {
    const pkg = subByUser.get(p.id as string)
    return {
      id: p.id as string,
      email: (p.email as string) ?? null,
      fullName: (p.full_name as string) ?? null,
      status: ((p.status as string) ?? 'active') as UserStatus,
      createdAt: p.created_at as string,
      siteCount: siteCounts.get(p.id as string) ?? 0,
      planName: pkg?.planName ?? null,
      planCode: pkg?.planCode ?? null,
      subscriptionStatus: pkg?.subscriptionStatus ?? null,
      periodStart: pkg?.periodStart ?? null,
      periodEnd: pkg?.periodEnd ?? null,
      creditBalance: credits.get(p.id as string)?.balance ?? 0,
    }
  })
}

type PackageSummary = {
  planName: string | null
  planCode: string | null
  subscriptionStatus: string | null
  periodStart: string | null
  periodEnd: string | null
}

/** A single user with their sites and credit ledger, for the detail view. */
export async function getUserDetail(userId: string): Promise<{
  user: AdminUser
  sites: AdminSite[]
  credits: AdminCreditTx[]
} | null> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: p } = await admin
    .from('profiles')
    .select('id, email, full_name, status, created_at')
    .eq('id', userId)
    .maybeSingle()
  if (!p) return null

  const credits = await buildCreditLookup(admin)

  const { data: projects } = await admin
    .from('projects')
    .select(
      'id, name, owner_id, slug, status, project_type, published, published_at, created_at, updated_at',
    )
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })

  const { data: sub } = await admin
    .from('billing_subscriptions')
    .select('status, current_period_start, current_period_end, billing_plans!billing_subscriptions_plan_id_fkey(name, code)')
    .eq('user_id', userId)
    .in('status', ['trialing', 'active', 'past_due'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const plan = sub?.billing_plans as { name?: string; code?: string } | { name?: string; code?: string }[] | null
  const planRow = Array.isArray(plan) ? plan[0] : plan
  const planName = planRow?.name ?? null

  const { data: ledger } = await admin
    .from('ai_credit_transactions')
    .select('id, user_id, kind, amount, reason, admin_email, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)

  const email = (p.email as string) ?? null

  return {
    user: {
      id: p.id as string,
      email,
      fullName: (p.full_name as string) ?? null,
      status: ((p.status as string) ?? 'active') as UserStatus,
      createdAt: p.created_at as string,
      siteCount: projects?.length ?? 0,
      planName,
      planCode: planRow?.code ?? null,
      subscriptionStatus: (sub?.status as string) ?? null,
      periodStart: (sub?.current_period_start as string) ?? null,
      periodEnd: (sub?.current_period_end as string) ?? null,
      creditBalance: credits.get(userId)?.balance ?? 0,
    },
    sites: (projects ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      ownerId: row.owner_id as string,
      ownerEmail: email,
      slug: (row.slug as string) ?? null,
      status: row.status as string,
      projectType: row.project_type as string,
      published: Boolean(row.published),
      publishedAt: (row.published_at as string) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    })),
    credits: (ledger ?? []).map((row) => ({
      id: row.id as string,
      userId: row.user_id as string,
      userEmail: email,
      kind: row.kind as string,
      amount: row.amount as number,
      reason: (row.reason as string) ?? null,
      adminEmail: (row.admin_email as string) ?? null,
      createdAt: row.created_at as string,
    })),
  }
}

/** Every site across all tenants, with owner email joined in. */
export async function listSites(): Promise<AdminSite[]> {
  await requireAdmin()
  const admin = createAdminClient()
  const users = await buildUserLookup(admin)

  const { data } = await admin
    .from('projects')
    .select(
      'id, name, owner_id, slug, status, project_type, published, published_at, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    ownerId: row.owner_id as string,
    ownerEmail: users.get(row.owner_id as string)?.email ?? null,
    slug: (row.slug as string) ?? null,
    status: row.status as string,
    projectType: row.project_type as string,
    published: Boolean(row.published),
    publishedAt: (row.published_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }))
}

/** All subscriptions with plan + owner email joined in. */
export async function listSubscriptions(): Promise<AdminSubscription[]> {
  await requireAdmin()
  const admin = createAdminClient()
  const users = await buildUserLookup(admin)

  const { data } = await admin
    .from('billing_subscriptions')
    .select(
      'id, user_id, status, current_period_end, cancel_at_period_end, created_at, billing_plans!billing_subscriptions_plan_id_fkey(name, code, price_cents, currency, interval)',
    )
    .order('created_at', { ascending: false })

  return (data ?? []).map((row) => {
    const plan = row.billing_plans as
      | { name?: string; code?: string; price_cents?: number; currency?: string; interval?: string }
      | { name?: string; code?: string; price_cents?: number; currency?: string; interval?: string }[]
      | null
    const p = Array.isArray(plan) ? plan[0] : plan
    return {
      id: row.id as string,
      userId: row.user_id as string,
      userEmail: users.get(row.user_id as string)?.email ?? null,
      planName: p?.name ?? '—',
      planCode: p?.code ?? '',
      priceCents: p?.price_cents ?? 0,
      currency: p?.currency ?? 'TRY',
      interval: p?.interval ?? 'month',
      status: row.status as string,
      currentPeriodEnd: (row.current_period_end as string) ?? null,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      createdAt: row.created_at as string,
    }
  })
}

/** Per-user credit balances plus the recent global ledger. */
export async function listCredits(): Promise<{
  users: AdminCreditUser[]
  recent: AdminCreditTx[]
  totalGifted: number
}> {
  await requireAdmin()
  const admin = createAdminClient()
  const users = await buildUserLookup(admin)
  const credits = await buildCreditLookup(admin)

  const creditUsers: AdminCreditUser[] = [...credits.entries()]
    .map(([userId, { balance, gifted }]) => ({
      userId,
      email: users.get(userId)?.email ?? null,
      fullName: users.get(userId)?.fullName ?? null,
      balance,
      gifted,
    }))
    .sort((a, b) => b.balance - a.balance)

  const { data: recent } = await admin
    .from('ai_credit_transactions')
    .select('id, user_id, kind, amount, reason, admin_email, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  const totalGifted = [...credits.values()].reduce((sum, c) => sum + c.gifted, 0)

  return {
    users: creditUsers,
    recent: (recent ?? []).map((row) => ({
      id: row.id as string,
      userId: row.user_id as string,
      userEmail: users.get(row.user_id as string)?.email ?? null,
      kind: row.kind as string,
      amount: row.amount as number,
      reason: (row.reason as string) ?? null,
      adminEmail: (row.admin_email as string) ?? null,
      createdAt: row.created_at as string,
    })),
    totalGifted,
  }
}

/** All custom domains across tenants (reuses the shared domain read layer). */
export async function listDomains(): Promise<
  Array<CustomDomain & { ownerEmail: string | null }>
> {
  await requireAdmin()
  const admin = createAdminClient()
  const users = await buildUserLookup(admin)
  const domains = await listAllDomains()
  return domains.map((d) => ({ ...d, ownerEmail: users.get(d.userId)?.email ?? null }))
}

/** Support tickets with message counts + owner email. */
export async function listTickets(): Promise<AdminTicket[]> {
  await requireAdmin()
  const admin = createAdminClient()
  const users = await buildUserLookup(admin)

  const { data } = await admin
    .from('support_tickets')
    .select(
      'id, user_id, subject, status, priority, created_at, updated_at, contact_email, ticket_number, department, service',
    )
    .order('updated_at', { ascending: false })

  const { data: msgs } = await admin
    .from('support_ticket_messages')
    .select('ticket_id')
  const counts = new Map<string, number>()
  for (const m of msgs ?? []) {
    const tid = m.ticket_id as string
    counts.set(tid, (counts.get(tid) ?? 0) + 1)
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    // Contact-form tickets have no user_id; fall back to the captured sender.
    userId: (row.user_id as string) ?? '',
    userEmail:
      users.get(row.user_id as string)?.email ?? (row.contact_email as string) ?? null,
    subject: row.subject as string,
    ticketNumber: (row.ticket_number as string) ?? '',
    department: (row.department as string) ?? 'other',
    service: (row.service as string) ?? null,
    projectName: null,
    status: row.status as AdminTicket['status'],
    priority: row.priority as AdminTicket['priority'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    messageCount: counts.get(row.id as string) ?? 0,
  }))
}

/** A single ticket with its full message thread. */
export async function getTicketDetail(ticketId: string): Promise<{
  ticket: AdminTicket
  messages: AdminTicketMessage[]
} | null> {
  await requireAdmin()
  const admin = createAdminClient()
  const users = await buildUserLookup(admin)

  const { data: t } = await admin
    .from('support_tickets')
    .select(
      'id, user_id, subject, status, priority, created_at, updated_at, contact_email, ticket_number, department, service, project_id',
    )
    .eq('id', ticketId)
    .maybeSingle()
  if (!t) return null

  const { data: msgs } = await admin
    .from('support_ticket_messages')
    .select('id, ticket_id, author_type, author_email, body, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })

  const { data: files } = await admin
    .from('support_ticket_attachments')
    .select('id, message_id, file_name, mime_type, size_bytes')
    .eq('ticket_id', ticketId)

  let projectName: string | null = null
  if (t.project_id) {
    const { data: p } = await admin.from('projects').select('name').eq('id', t.project_id).maybeSingle()
    projectName = (p?.name as string) ?? null
  }

  return {
    ticket: {
      id: t.id as string,
      userId: (t.user_id as string) ?? '',
      userEmail:
        users.get(t.user_id as string)?.email ?? (t.contact_email as string) ?? null,
      subject: t.subject as string,
      ticketNumber: (t.ticket_number as string) ?? '',
      department: (t.department as string) ?? 'other',
      service: (t.service as string) ?? null,
      projectName,
      status: t.status as AdminTicket['status'],
      priority: t.priority as AdminTicket['priority'],
      createdAt: t.created_at as string,
      updatedAt: t.updated_at as string,
      messageCount: msgs?.length ?? 0,
    },
    messages: (msgs ?? []).map((m) => ({
      id: m.id as string,
      ticketId: m.ticket_id as string,
      authorType: m.author_type as 'user' | 'admin',
      authorEmail: (m.author_email as string) ?? null,
      body: m.body as string,
      createdAt: m.created_at as string,
      attachments: (files ?? [])
        .filter((f) => f.message_id === m.id)
        .map((f) => ({
          id: f.id as string,
          fileName: f.file_name as string,
          mimeType: f.mime_type as string,
          sizeBytes: f.size_bytes as number,
        })),
    })),
  }
}

/** Recent notification log entries with owner email. */
export async function listNotifications(): Promise<AdminNotification[]> {
  await requireAdmin()
  const admin = createAdminClient()
  const users = await buildUserLookup(admin)

  const { data } = await admin
    .from('notification_logs')
    .select('id, user_id, channel, type, subject, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  return (data ?? []).map((row) => ({
    id: row.id as string,
    userId: (row.user_id as string) ?? null,
    userEmail: row.user_id ? users.get(row.user_id as string)?.email ?? null : null,
    channel: row.channel as string,
    type: row.type as string,
    subject: (row.subject as string) ?? null,
    status: row.status as string,
    createdAt: row.created_at as string,
  }))
}

/** Dashboard rollup. One place computes every headline metric. */
export async function getOverview(): Promise<AdminOverview> {
  await requireAdmin()
  const admin = createAdminClient()

  const [users, sites, subs, credits] = await Promise.all([
    listUsers(),
    listSites(),
    listSubscriptions(),
    listCredits(),
  ])

  const activeSubs = subs.filter((s) => s.status === 'active' || s.status === 'trialing')
  // Normalize every active subscription to a monthly figure for MRR.
  const monthlyRecurringCents = activeSubs.reduce((sum, s) => {
    if (s.priceCents <= 0) return sum
    if (s.interval === 'year') return sum + Math.round(s.priceCents / 12)
    if (s.interval === 'once') return sum
    return sum + s.priceCents
  }, 0)

  const { count: openTickets } = await admin
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .in('status', ['open', 'in_progress'])

  return {
    userCount: users.length,
    activeUserCount: users.filter((u) => u.status === 'active').length,
    siteCount: sites.length,
    publishedSiteCount: sites.filter((s) => s.published).length,
    activeSubscriptions: activeSubs.length,
    monthlyRecurringCents,
    openTickets: openTickets ?? 0,
    giftedCredits: credits.totalGifted,
    recentUsers: users.slice(0, 5),
    recentSites: sites.slice(0, 5),
  }
}

/**
 * Package-management data for one user: live subscription row, the selectable
 * plan catalog (add-ons excluded), payment history, immutable admin audit trail
 * and any active per-user site-limit override. Admin-only.
 */
export async function getUserPackageDetail(userId: string): Promise<AdminPackageDetail> {
  await requireAdmin()
  const admin = createAdminClient()

  const [{ data: subRow }, { data: planRows }, { data: txRows }, { data: auditRows }, { data: ovRow }, { count }] =
    await Promise.all([
      admin
        .from('billing_subscriptions')
        .select(
          'id, plan_id, status, provider, provider_ref, current_period_start, current_period_end, cancel_at_period_end, pending_plan_id, billing_plans!billing_subscriptions_plan_id_fkey(code, name)',
        )
        .eq('user_id', userId)
        .in('status', ['trialing', 'active', 'past_due', 'incomplete'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('billing_plans')
        .select('id, code, name, price_cents, currency, interval, product_category')
        .eq('active', true)
        .neq('product_category', 'addon')
        .order('sort_order', { ascending: true }),
      admin
        .from('billing_transactions')
        .select('id, kind, amount_cents, currency, status, provider, description, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30),
      admin
        .from('admin_package_audit')
        .select('id, created_at, admin_email, action, field, old_value, new_value, reason, status, error')
        .eq('target_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .from('user_limit_overrides')
        .select('site_limit, expires_at, reason, updated_by, updated_at')
        .eq('user_id', userId)
        .maybeSingle(),
      admin
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .eq('published', true),
    ])

  let subscription: AdminPackageSubscription | null = null
  if (subRow) {
    const plan = subRow.billing_plans as { code?: string; name?: string } | { code?: string; name?: string }[] | null
    const p = Array.isArray(plan) ? plan[0] : plan
    subscription = {
      id: subRow.id as string,
      planId: subRow.plan_id as string,
      planCode: p?.code ?? '',
      planName: p?.name ?? '—',
      status: subRow.status as string,
      provider: subRow.provider as string,
      providerRef: (subRow.provider_ref as string) ?? null,
      currentPeriodStart: subRow.current_period_start as string,
      currentPeriodEnd: (subRow.current_period_end as string) ?? null,
      cancelAtPeriodEnd: Boolean(subRow.cancel_at_period_end),
      pendingPlanId: (subRow.pending_plan_id as string) ?? null,
    }
  }

  const override: AdminLimitOverride | null =
    ovRow && (!ovRow.expires_at || new Date(ovRow.expires_at as string) > new Date())
      ? {
          siteLimit: ovRow.site_limit as number,
          expiresAt: (ovRow.expires_at as string) ?? null,
          reason: (ovRow.reason as string) ?? null,
          updatedBy: ovRow.updated_by as string,
          updatedAt: ovRow.updated_at as string,
        }
      : null

  return {
    subscription,
    plans: (planRows ?? []).map((r) => ({
      id: r.id as string,
      code: r.code as string,
      name: r.name as string,
      priceCents: r.price_cents as number,
      currency: r.currency as string,
      interval: r.interval as string,
      productCategory: (r.product_category as string) ?? null,
    })),
    transactions: (txRows ?? []).map((r) => ({
      id: r.id as string,
      kind: r.kind as string,
      amountCents: r.amount_cents as number,
      currency: r.currency as string,
      status: r.status as string,
      provider: r.provider as string,
      description: (r.description as string) ?? null,
      createdAt: r.created_at as string,
    })),
    audit: (auditRows ?? []).map((r) => ({
      id: r.id as string,
      createdAt: r.created_at as string,
      adminEmail: r.admin_email as string,
      action: r.action as string,
      field: (r.field as string) ?? null,
      oldValue: r.old_value ?? null,
      newValue: r.new_value ?? null,
      reason: (r.reason as string) ?? null,
      status: r.status as string,
      error: (r.error as string) ?? null,
    })),
    override,
    publishedCount: count ?? 0,
  }
}
