/**
 * Pure rules for store-customer anonymization and the owner customer directory.
 * No database, no `next/*` imports, so every rule is unit tested.
 */

export type OrderStateRow = {
  status?: string | null
  payment_status?: string | null
  shipping_status?: string | null
}

const SETTLED_STATUSES = new Set(['cancelled', 'canceled', 'failed', 'refunded', 'completed', 'fulfilled', 'delivered'])
const SETTLED_SHIPPING = new Set(['delivered', 'cancelled', 'canceled'])

/**
 * An order "in flight" blocks account deletion: it is still being paid for,
 * prepared or shipped, so the buyer must stay reachable. Cancelled, failed,
 * refunded and delivered orders do not block. Unknown statuses block, so a new
 * status can never silently allow a deletion mid-fulfilment.
 */
export function isBlockingOrder(order: OrderStateRow): boolean {
  const status = (order.status ?? '').toLowerCase()
  const shipping = (order.shipping_status ?? '').toLowerCase()
  const payment = (order.payment_status ?? '').toLowerCase()
  if (SETTLED_STATUSES.has(status)) return false
  if (SETTLED_SHIPPING.has(shipping)) return false
  // An abandoned/failed payment attempt that never became an order.
  if (status === 'pending' && payment === 'failed') return false
  return true
}

export function hasBlockingOrders(orders: readonly OrderStateRow[]): boolean {
  return orders.some(isBlockingOrder)
}

/** Placeholder address that can never receive mail and is unique per customer. */
export function anonymizedEmail(customerId: string): string {
  return `deleted+${customerId}@invalid.local`
}

/**
 * The single UPDATE applied on deletion. Every personal field is wiped; the
 * `password_changed_at` bump invalidates any cookie still in circulation, on
 * top of the `deleted_at` check in session authentication.
 */
export function buildAnonymizePatch(customerId: string, nowIso: string) {
  return {
    email: anonymizedEmail(customerId),
    name: '',
    phone: '',
    city: '',
    address: '',
    invoice: null,
    password_hash: '',
    reset_token_hash: null,
    reset_token_expires: null,
    password_changed_at: nowIso,
    deleted_at: nowIso,
    anonymized_at: nowIso,
  }
}

/**
 * Patch applied to a deleted customer's notification log rows. ONLY the free-text
 * `body` is cleared. `dedupe_key`, `type`, `status`, `created_at` and `user_id`
 * must never appear here: the unique `dedupe_key` is what stops an order e-mail
 * from being sent twice, and the row itself stays as the audit record.
 */
export function buildNotificationScrubPatch() {
  return { body: null }
}

/** `store-order:<orderId>:<role>` keys of one order, as a PostgREST `like` prefix. */
export function orderDedupePrefix(orderId: string): string {
  return `store-order:${orderId}:`
}

/** PostgREST `or()` filter matching every notification key that belongs to the given orders. */
export function orderNotificationOrFilter(orderIds: readonly string[]): string {
  return orderIds.map((id) => `dedupe_key.like.${orderDedupePrefix(id)}*`).join(',')
}

/** Order ids are UUIDs; anything else is dropped so it can never alter the filter string. */
export function isSafeOrderId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/** Accepts SİL / SIL / sil / DELETE (Turkish dotted/dotless i folded). */
export function confirmPhraseMatches(input: unknown): boolean {
  if (typeof input !== 'string') return false
  const folded = input.trim().replace(/İ/g, 'I').replace(/ı/g, 'I').toUpperCase()
  return folded === 'SIL' || folded === 'DELETE'
}

/** True when a Postgres/PostgREST error means the deletion migration is not applied yet. */
export function isMissingDeletionSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  const code = error.code ?? ''
  if (['42703', '42883', '42P01', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code)) return true
  const message = (error.message ?? '').toLowerCase()
  return (
    message.includes('deleted_at') ||
    message.includes('anonymized_at') ||
    message.includes('store_owner_customers') ||
    message.includes('store_customer_events')
  )
}

/** Escapes `\`, `%` and `_` so user input is a literal inside an ILIKE pattern. */
export function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

/** Search text is only applied from two characters; shorter returns null (no filter). */
export function normalizeCustomerSearch(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().slice(0, 100)
  return trimmed.length >= 2 ? escapeLikePattern(trimmed) : null
}

export type CustomerSort = 'newest' | 'spent' | 'last_order'

export function parseCustomerSort(raw: unknown): CustomerSort {
  return raw === 'spent' || raw === 'last_order' ? raw : 'newest'
}

export const CUSTOMERS_PAGE_SIZE = 25
export const CUSTOMERS_EXPORT_CAP = 5000

/**
 * CSV cell with spreadsheet formula-injection protection: a value starting with
 * = + - @ (or tab/CR) is prefixed with an apostrophe, then quoted when needed.
 */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export type CustomerCsvRow = {
  name: string
  email: string
  phone: string
  city: string
  created_at: string
  order_count: number
  total_spent_cents: number
  last_order_at: string | null
}

export const CUSTOMER_CSV_HEADER = [
  'Ad Soyad',
  'E-posta',
  'Telefon',
  'Şehir',
  'Kayıt tarihi',
  'Sipariş sayısı',
  'Toplam harcama',
  'Son sipariş',
] as const

/** UTF-8 BOM so Excel opens Turkish characters correctly. */
export function buildCustomersCsv(rows: readonly CustomerCsvRow[]): string {
  const lines = [CUSTOMER_CSV_HEADER.map(csvCell).join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.name,
        r.email,
        r.phone,
        r.city,
        r.created_at,
        r.order_count,
        (r.total_spent_cents / 100).toFixed(2),
        r.last_order_at ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export type OwnerOrderRow = {
  status?: string | null
  payment_status?: string | null
  total_cents?: number | null
}

/** Mirrors the SQL aggregate: only paid orders that were not cancelled/refunded/failed count as spend. */
export function countsAsSpend(order: OwnerOrderRow): boolean {
  const status = (order.status ?? '').toLowerCase()
  return (order.payment_status ?? '').toLowerCase() === 'paid' && !['cancelled', 'canceled', 'refunded', 'failed'].includes(status)
}

export function summarizeOrders(orders: readonly OwnerOrderRow[]): { orderCount: number; totalSpentCents: number } {
  let orderCount = 0
  let totalSpentCents = 0
  for (const o of orders) {
    if ((o.status ?? '').toLowerCase() === 'failed') continue
    orderCount += 1
    if (countsAsSpend(o)) totalSpentCents += Number(o.total_cents ?? 0)
  }
  return { orderCount, totalSpentCents }
}

/** Zero-based row offset for a 1-based page number from the query string. */
export function pageOffset(rawPage: unknown, pageSize: number = CUSTOMERS_PAGE_SIZE): { page: number; offset: number } {
  const n = Number.parseInt(typeof rawPage === 'string' ? rawPage : '', 10)
  const page = Number.isFinite(n) && n >= 1 ? Math.min(n, 10_000) : 1
  return { page, offset: (page - 1) * pageSize }
}

/** Owner confirmation for deleting someone else's account: the customer's e-mail, case-insensitive. */
export function emailConfirmMatches(input: unknown, email: string): boolean {
  return typeof input === 'string' && email.length > 0 && input.trim().toLowerCase() === email.trim().toLowerCase()
}

/** Audit rows carry ids and an event name only. */
export function buildAuditEvent(input: {
  projectId: string
  customerId: string | null
  event: 'deleted_by_customer' | 'anonymized_by_owner' | 'exported_by_owner'
  actorUserId?: string | null
}) {
  return {
    project_id: input.projectId,
    customer_id: input.customerId,
    event: input.event,
    actor_user_id: input.actorUserId ?? null,
  }
}
