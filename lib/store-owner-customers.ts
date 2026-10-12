'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeProjectOwner } from '@/lib/store-payments/owner-auth'
import { hitRateLimit } from '@/lib/store-auth-rate-limit'
import { anonymizeStoreCustomer, sendAccountDeletedEmail } from '@/lib/store-customer-deletion'
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
  summarizeOrders,
  type CustomerSort,
} from '@/lib/store-customer-privacy'
import { ACCOUNT_DELETION_COPY } from '@/lib/store-account-copy'

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
}

export type OwnerCustomerList =
  | {
      ok: true
      rows: OwnerCustomerRow[]
      total: number
      page: number
      pageSize: number
      stats: { members: number; newThisMonth: number; deleted: number }
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
  }
}

async function authorize(projectId: string) {
  try {
    return await authorizeProjectOwner(projectId)
  } catch {
    return null
  }
}

export async function listOwnerCustomers(input: {
  projectId: string
  q?: string
  sort?: string
  page?: string
}): Promise<OwnerCustomerList> {
  const auth = await authorize(input.projectId)
  if (!auth) return { ok: false, reason: 'unauthorized' }

  const admin = createAdminClient()
  const sort: CustomerSort = parseCustomerSort(input.sort)
  const { page, offset } = pageOffset(input.page)

  const { data, error } = await admin.rpc('store_owner_customers', {
    p_project_id: input.projectId,
    p_search: normalizeCustomerSearch(input.q),
    p_sort: sort,
    p_limit: CUSTOMERS_PAGE_SIZE,
    p_offset: offset,
  })
  if (error) return { ok: false, reason: isMissingDeletionSchema(error) ? 'migration_pending' : 'failed' }

  const list = (data ?? []) as RpcRow[]
  const total = list.length > 0 ? Number(list[0].total_count ?? 0) : 0

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const [members, fresh, deleted] = await Promise.all([
    admin
      .from('store_customers')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', input.projectId)
      .is('deleted_at', null),
    admin
      .from('store_customers')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', input.projectId)
      .is('deleted_at', null)
      .gte('created_at', monthStart.toISOString()),
    admin
      .from('store_customers')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', input.projectId)
      .not('deleted_at', 'is', null),
  ])

  return {
    ok: true,
    rows: list.map(toRow),
    total,
    page,
    pageSize: CUSTOMERS_PAGE_SIZE,
    stats: { members: members.count ?? 0, newThisMonth: fresh.count ?? 0, deleted: deleted.count ?? 0 },
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
  const { data: c, error } = await admin
    .from('store_customers')
    .select('id, email, name, phone, city, address, invoice, created_at')
    .eq('project_id', projectId)
    .eq('id', customerId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !c) return { ok: false, error: 'Müşteri bulunamadı.' }

  const { data: orders } = await admin
    .from('ecommerce_orders')
    .select('id, created_at, total_cents, currency, status, payment_status')
    .eq('project_id', projectId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(200)
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
      orderCount,
      totalSpentCents,
      orders: list,
    },
  }
}

export async function deleteCustomerByOwner(input: {
  projectId: string
  customerId: string
  confirmEmail: string
}): Promise<{ ok: true } | { ok: false; error: string; code: 'blocked' | 'invalid' | 'failed' }> {
  const copy = ACCOUNT_DELETION_COPY.tr
  const auth = await authorize(input.projectId)
  if (!auth) return { ok: false, code: 'failed', error: 'Yetkisiz erişim.' }

  const admin = createAdminClient()
  const { data: c, error } = await admin
    .from('store_customers')
    .select('id, email')
    .eq('project_id', input.projectId)
    .eq('id', input.customerId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) {
    return { ok: false, code: 'failed', error: isMissingDeletionSchema(error) ? copy.migrationPending : copy.failed }
  }
  if (!c) return { ok: false, code: 'failed', error: 'Müşteri bulunamadı.' }

  if (!emailConfirmMatches(input.confirmEmail, String(c.email))) {
    return { ok: false, code: 'invalid', error: 'Onay için müşterinin e-posta adresini yazın.' }
  }

  const result = await anonymizeStoreCustomer({
    projectId: input.projectId,
    customerId: input.customerId,
    event: 'anonymized_by_owner',
    actorUserId: auth.actorId,
  })
  if (!result.ok) {
    if (result.reason === 'blocked') {
      return { ok: false, code: 'blocked', error: 'Müşterinin devam eden siparişi var; tamamlanınca veya iptal edilince silinebilir.' }
    }
    if (result.reason === 'migration_pending') return { ok: false, code: 'failed', error: copy.migrationPending }
    return { ok: false, code: 'failed', error: copy.failed }
  }

  await sendAccountDeletedEmail({
    projectId: input.projectId,
    customerId: input.customerId,
    to: result.previousEmail,
    customerName: result.previousName,
    byOwner: true,
  })
  return { ok: true }
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
