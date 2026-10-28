import { INVOICE_PAGE_SIZE } from '@/lib/invoices/constants'
import { isLiveProvider } from '@/lib/invoices/scope'
import type { AdminInvoiceRow, InvoiceCounts, InvoiceFilters } from '@/lib/invoices/types'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function isValidDateInput(value: string): boolean {
  if (!DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Start of a calendar day in Turkey (UTC+3, no DST), as an epoch. */
function istanbulDayStart(day: string): number {
  return Date.parse(`${day}T00:00:00+03:00`)
}

/** The worklist: real iyzico charges, plus test and gift rows only when asked for. */
export function inScope(row: AdminInvoiceRow, showTest: boolean): boolean {
  return showTest || isLiveProvider(row.provider)
}

export function countByStatus(rows: AdminInvoiceRow[]): InvoiceCounts {
  const counts: InvoiceCounts = { pending: 0, uploaded: 0, not_required: 0, total: rows.length }
  for (const row of rows) {
    if (!row.invoice) counts.pending += 1
    else counts[row.invoice.status] += 1
  }
  return counts
}

export function applyInvoiceFilters(rows: AdminInvoiceRow[], filters: InvoiceFilters): AdminInvoiceRow[] {
  const from = isValidDateInput(filters.from) ? istanbulDayStart(filters.from) : null
  const to = isValidDateInput(filters.to) ? istanbulDayStart(filters.to) + 24 * 60 * 60 * 1000 : null
  const query = filters.q.trim().toLowerCase()

  return rows.filter((row) => {
    if (!inScope(row, filters.showTest)) return false
    if (filters.status === 'pending' && row.invoice) return false
    if (filters.status === 'uploaded' && row.invoice?.status !== 'uploaded') return false
    if (filters.status === 'not_required' && row.invoice?.status !== 'not_required') return false
    if (filters.category !== 'all' && row.category !== filters.category) return false
    const created = Date.parse(row.createdAt)
    if (from !== null && created < from) return false
    if (to !== null && created >= to) return false
    if (query) {
      const haystack = [
        row.email,
        row.fullName,
        row.transactionNumber,
        row.invoice?.invoiceNumber ?? '',
        row.description,
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
}

export function paginate<T>(items: T[], page: number, pageSize: number = INVOICE_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages)
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, pages }
}

const STATUS_VALUES = ['all', 'pending', 'uploaded', 'not_required'] as const
const CATEGORY_VALUES = ['all', 'subscription', 'ai_topup', 'domain', 'site_right', 'other'] as const

type RawParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/** Reads untrusted URL params into a safe filter set. */
export function parseInvoiceFilters(params: RawParams): InvoiceFilters {
  const status = first(params.status)
  const category = first(params.category)
  const from = first(params.from)
  const to = first(params.to)
  return {
    status: (STATUS_VALUES as readonly string[]).includes(status) ? (status as InvoiceFilters['status']) : 'pending',
    category: (CATEGORY_VALUES as readonly string[]).includes(category) ? (category as InvoiceFilters['category']) : 'all',
    showTest: first(params.test) === '1',
    from: isValidDateInput(from) ? from : '',
    to: isValidDateInput(to) ? to : '',
    q: first(params.q).slice(0, 100),
    page: Number.parseInt(first(params.page), 10) || 1,
  }
}
