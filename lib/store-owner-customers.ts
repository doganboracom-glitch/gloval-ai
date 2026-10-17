'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeProjectOwner } from '@/lib/store-payments/owner-auth'
import { isEcommerceProjectId } from '@/lib/commerce-mode-server'
import { hitRateLimit } from '@/lib/store-auth-rate-limit'
import { isDbQueryError, requireOk } from '@/lib/db-guard'
import {
  purgeSuspendedCustomerNow,
  restoreStoreCustomer,
  suspendStoreCustomer,
} from '@/lib/store-customer-grace'
import {
  CUSTOMERS_EXPORT_CAP,
  CUSTOMERS_PAGE_SIZE,
  buildAuditEvent,
  buildCustomersCsv,
  emailConfirmMatches,
  isMissingDeletionSchema,
  normalizeCustomerSearch,
  pageOffset,
  parseCustomerSort,
  parseCustomerStatus,
  summarizeOrders,
  type CustomerSort,
  type CustomerStatus,
} from '@/lib/store-customer-privacy'
import { ACCOUNT_DELETION_COPY, OWNER_DELETION_COPY } from '@/lib/store-account-copy'

/**
 * Owner-side customer directory. Every entry point authorizes the caller as the
 * project owner (or allow-listed admin) BEFORE any service-role access, and every
 * query is scoped by that project id. Password hashes, tokens and sessions are
 * never selected.
 */

export type OwnerCustomerRow = {
  id: string
  email: string
  name: string
  phone: string
  city: string
  created_at: string
  order_count: number
  total_spent_cents: number
  last_order_at: string | null
  deletion_scheduled_at: string | null
}

export type OwnerCustomerList =
  | {
      ok: true
      rows: OwnerCustomerRow[]
      total: number
      page: number
      pageSize: number
      status: CustomerStatus
      stats: { members: number; newThisMonth: number; deleted: number; pending: number }
    }
  | { ok: false; reason: 'migration_pending' | 'unauthorized' | 'failed' }

type RpcRow = Record<string, unknown>

function toRow(r: RpcRow): OwnerCustomerRow {
  return {
    id: String(r.id),
    email: String(r.email ?? ''),
    name: String(r.name ?? ''),
    phone: String(r.phone ?? ''),
    city: String(r.city ?? ''),
    created_at: String(r.created_at ?? ''),
    order_count: Number(r.order_count ?? 0),
    total_spent_cents: Number(r.total_spent_cents ?? 0),
    last_order_at: r.last_order_at ? String(r.last_order_at) : null,
    deletion_scheduled_at: r.deletion_scheduled_at ? String(r.deletion_scheduled_at) : null,
  }
}

async function authorize(projectId: string) {
  try {
    const auth = await authorizeProjectOwner(projectId)
    if (!(await isEcommerceProjectId(projectId))) return null
    return auth
  } catch {
    return null
  }
}

type Admin = ReturnType<typeof createAdminClient>

/** Counts active members; before 044 the `deletion_scheduled_at` filter is unavailable, so it is dropped. */
async function countMembers(admin: Admin, projectId: string, sinceIso?: string): Promise<number> {
  const base = () => {
    let q = admin
      .from('store_customers')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .is('deleted_at', null)
    if (sinceIso) q = q.gte('created_at', sinceIso)
    return q
  }
  const res = await base().is('deletion_scheduled_at', null)
  if (!res.error) return res.count ?? 0
  // Only a missing deletion column may fall back; any other failure must not read as "0 members".
  if (!isMissingDeletionSchema(res.error)) requireOk('ownerCustomers.countMembers', res)
  const legacy = await base()
  requireOk('ownerCustomers.countMembersLegacy', legacy)
  return legacy.count ?? 0
}

type CountResult = { count: number | null; error: { code?: string; message?: string } | null }

/** Permanently deleted only: suspended accounts keep deleted_at null. */
async function countDeleted(admin: Admin, projectId: string): Promise<CountResult> {
  const { count, error } = await admin
    .from('store_customers')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .not('deleted_at', 'is', null)
  return { count, error }
}

async function countPending(admin: Admin, projectId: string): Promise<CountResult> {
  const { count, error } = await admin
    .from('store_customers')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .is('anonymized_at', null)
    .not('deletion_scheduled_at', 'is', null)
  return { count, error }
}

export async function listOwnerCustomers(input: {
  projectId: string
  q?: string
  sort?: string
  page?: string
  status?: string
}): Promise<OwnerCustomerList> {
  const auth = await authorize(input.projectId)
  if (!auth) return { ok: false, reason: 'unauthorized' }

  const admin = createAdminClient()
  const sort: CustomerSort = parseCustomerSort(input.sort)
  const status = parseCustomerStatus(input.status)
  const { page, offset } = pageOffset(input.page)

  const args = {
    p_project_id: input.projectId,
    p_search: normalizeCustomerSearch(input.q),
    p_sort: sort,
    p_limit: CUSTOMERS_PAGE_SIZE,
    p_offset: offset,
  }
  let res = await admin.rpc('store_owner_customers', { ...args, p_status: status })
  // Before 044 the function has no p_status argument: the active list still works.
  if (res.error && status === 'active' && isMissingDeletionSchema(res.error)) {
    res = await admin.rpc('store_owner_customers', args)
  }
  const { data, error } = res
  if (error) return { ok: false, reason: isMissingDeletionSchema(error) ? 'migration_pending' : 'failed' }

  const list = (data ?? []) as RpcRow[]
  const total = list.length > 0 ? Number(list[0].total_count ?? 0) : 0

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  let members: number
  let newThisMonth: number
  let deleted: CountResult
  let pending: CountResult
  try {
    ;[members, newThisMonth, deleted, pending] = await Promise.all([
      countMembers(admin, input.projectId),
      countMembers(admin, input.projectId, monthStart.toISOString()),
      countDeleted(admin, input.projectId),
      countPending(admin, input.projectId),
    ])
  } catch (error) {
    console.error('[store-owner-customers] stats failed', { code: isDbQueryError(error) ? error.code : 'unknown' })
    return { ok: false, reason: 'failed' }
  }
  // Before 044 the pending filter column is missing (reads as 0); any other error must not show wrong stats.
  if (deleted.error || (pending.error && !isMissingDeletionSchema(pending.error))) {
    console.error('[store-owner-customers] stats failed', {
      code: (deleted.error ?? pending.error)?.code ?? 'unknown',
    })
    return { ok: false, reason: 'failed' }
  }

  return {
    ok: true,
    rows: list.map(toRow),
    total,
    page,
    pageSize: CUSTOMERS_PAGE_SIZE,
    status,
    stats: { members, newThisMonth, deleted: deleted.count ?? 0, pending: pending.count ?? 0 },
  }
}

export type OwnerCustomerDetail = {
  id: string
  email: string
  name: string
  phone: string
  city: string
  address: string
  invoice: Record<string, unknown> | null
  created_at: string
  deletionScheduledAt: string | null
  orderCount: number
  totalSpentCents: number
  orders: {
    id: string
    created_at: string
    total_cents: number
    currency: string
    status: string
    payment_status: string
  }[]
}

export async function getOwnerCustomerDetail(
  projectId: string,
  customerId: string,
): Promise<{ ok: true; customer: OwnerCustomerDetail } | { ok: false; error: string }> {
  const auth = await authorize(projectId)
  if (!auth) return { ok: false, error: 'Yetkisiz erişim.' }

  const admin = createAdminClient()
  const detailQuery = (columns: string) =>
    admin
      .from('store_customers')
      .select(columns)
      .eq('project_id', projectId)
      .eq('id', customerId)
      .is('deleted_at', null)
      .maybeSingle()
  const base = 'id, email, name, phone, city, address, invoice, created_at'
  let found = await detailQuery(`${base}, deletion_scheduled_at`)
  // Before 044 the deletion column does not exist: read the plain profile instead.
  if (found.error && isMissingDeletionSchema(found.error)) found = await detailQuery(base)
  if (found.error) {
    console.error('[store-owner-customers] customer read failed', { code: found.error.code ?? 'unknown' })
    return { ok: false, error: 'Müşteri yüklenemedi. Lütfen tekrar deneyin.' }
  }
  const c = found.data as Record<string, unknown> | null
  if (!c) return { ok: false, error: 'Müşteri bulunamadı.' }

  const { data: orders, error: ordersError } = await admin
    .from('ecommerce_orders')
    .select('id, created_at, total_cents, currency, status, payment_status')
    .eq('project_id', projectId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(200)
  // Showing an empty history (and a zero total) for a failed read would be wrong data.
  if (ordersError) {
    console.error('[store-owner-customers] order history failed', { code: ordersError.code })
    return { ok: false, error: 'Siparişler yüklenemedi. Lütfen tekrar deneyin.' }
  }
  const list = (orders ?? []).map((o) => ({
    id: String(o.id),
    created_at: String(o.created_at),
    total_cents: Number(o.total_cents ?? 0),
    currency: String(o.currency ?? 'TRY'),
    status: String(o.status ?? ''),
    payment_status: String(o.payment_status ?? ''),
  }))
  const { orderCount, totalSpentCents } = summarizeOrders(list)

  return {
    ok: true,
    customer: {
      id: String(c.id),
      email: String(c.email ?? ''),
      name: String(c.name ?? ''),
      phone: String(c.phone ?? ''),
      city: String(c.city ?? ''),
      address: String(c.address ?? ''),
      invoice: (c.invoice as Record<string, unknown> | null) ?? null,
      created_at: String(c.created_at),
      deletionScheduledAt: c.deletion_scheduled_at ? String(c.deletion_scheduled_at) : null,
      orderCount,
      totalSpentCents,
      orders: list,
    },
  }
}

export type OwnerActionResult =
  | { ok: true; scheduledAt?: string }
  | { ok: false; error: string; code: 'blocked' | 'invalid' | 'failed' }

const E = OWNER_DELETION_COPY.errors

function failure(reason: string): OwnerActionResult {
  switch (reason) {
    case 'blocked':
      return { ok: false, code: 'blocked', error: E.blocked }
    case 'not_found':
      return { ok: false, code: 'failed', error: E.notFound }
    case 'already_pending':
      return { ok: false, code: 'failed', error: E.alreadyPending }
    case 'not_pending':
      return { ok: false, code: 'failed', error: E.notPending }
    case 'not_restorable':
      return { ok: false, code: 'failed', error: E.notRestorable }
    case 'migration_pending':
      return { ok: false, code: 'failed', error: E.migrationPending }
    default:
      return { ok: false, code: 'failed', error: E.failed }
  }
}

/** Loads a customer's email for the typed confirmation, scoped to this project. */
async function loadConfirmEmail(
  projectId: string,
  customerId: string,
  pending: boolean,
): Promise<{ email: string } | OwnerActionResult> {
  const admin = createAdminClient()
  let query = admin
    .from('store_customers')
    .select('id, email')
    .eq('project_id', projectId)
    .eq('id', customerId)
    .is('deleted_at', null)
  if (pending) query = query.not('deletion_scheduled_at', 'is', null).is('anonymized_at', null)
  const { data, error } = await query.maybeSingle()
  if (error) {
    return { ok: false, code: 'failed', error: isMissingDeletionSchema(error) ? E.migrationPending : E.failed }
  }
  if (!data) return failure(pending ? 'not_pending' : 'not_found')
  return { email: String(data.email ?? '') }
}

/** "Hesabı sil": suspends the account for 30 days instead of wiping it. */
export async function suspendCustomerByOwner(input: {
  projectId: string
  customerId: string
  confirmEmail: string
}): Promise<OwnerActionResult> {
  const auth = await authorize(input.projectId)
  if (!auth) return { ok: false, code: 'failed', error: E.unauthorized }

  const loaded = await loadConfirmEmail(input.projectId, input.customerId, false)
  if (!('email' in loaded)) return loaded
  if (!emailConfirmMatches(input.confirmEmail, loaded.email)) {
    return { ok: false, code: 'invalid', error: E.confirmEmail }
  }

  const result = await suspendStoreCustomer({
    projectId: input.projectId,
    customerId: input.customerId,
    actorUserId: auth.actorId,
  })
  return result.ok ? { ok: true, scheduledAt: result.scheduledAt } : failure(result.reason)
}

export async function restoreCustomerByOwner(input: {
  projectId: string
  customerId: string
}): Promise<OwnerActionResult> {
  const auth = await authorize(input.projectId)
  if (!auth) return { ok: false, code: 'failed', error: E.unauthorized }
  const result = await restoreStoreCustomer({
    projectId: input.projectId,
    customerId: input.customerId,
    actorUserId: auth.actorId,
  })
  return result.ok ? { ok: true } : failure(result.reason)
}

/** "Hemen kalıcı sil": wipes a suspended account now, after typing its email. */
export async function purgeCustomerByOwner(input: {
  projectId: string
  customerId: string
  confirmEmail: string
}): Promise<OwnerActionResult> {
  const auth = await authorize(input.projectId)
  if (!auth) return { ok: false, code: 'failed', error: E.unauthorized }

  const loaded = await loadConfirmEmail(input.projectId, input.customerId, true)
  if (!('email' in loaded)) return loaded
  if (!emailConfirmMatches(input.confirmEmail, loaded.email)) {
    return { ok: false, code: 'invalid', error: E.confirmEmail }
  }

  const result = await purgeSuspendedCustomerNow({
    projectId: input.projectId,
    customerId: input.customerId,
    actorUserId: auth.actorId,
  })
  if (result.ok) return { ok: true }
  return failure(result.reason === 'already_deleted' ? 'not_pending' : result.reason)
}

export async function exportCustomersCsv(
  projectId: string,
): Promise<{ ok: true; csv: string; filename: string } | { ok: false; error: string }> {
  const auth = await authorize(projectId)
  if (!auth) return { ok: false, error: 'Yetkisiz erişim.' }

  const limit = await hitRateLimit({
    name: 'customers-export',
    key: `${projectId}|${auth.actorId}`,
    limit: 5,
    windowSeconds: 60 * 60,
  })
  if (!limit.allowed) return { ok: false, error: 'Çok fazla dışa aktarma denemesi. Lütfen bir saat sonra tekrar deneyin.' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('store_owner_customers', {
    p_project_id: projectId,
    p_search: null,
    p_sort: 'newest',
    p_limit: CUSTOMERS_EXPORT_CAP,
    p_offset: 0,
  })
  if (error) {
    return {
      ok: false,
      error: isMissingDeletionSchema(error)
        ? 'Müşteri listesi için veritabanı güncellemesi bekleniyor.'
        : 'Dışa aktarma başarısız oldu.',
    }
  }

  const rows = ((data ?? []) as RpcRow[]).map(toRow)
  const { error: auditError } = await admin
    .from('store_customer_events')
    .insert(buildAuditEvent({ projectId, customerId: null, event: 'exported_by_owner', actorUserId: auth.actorId }))
  if (auditError) console.log('[v0] export audit not recorded:', auditError.code ?? 'unknown')

  return {
    ok: true,
    csv: buildCustomersCsv(rows),
    filename: `musteriler-${new Date().toISOString().slice(0, 10)}.csv`,
  }
}
