import type { PaymentCategory } from '@/lib/invoices/scope'

export type InvoiceStatus = 'uploaded' | 'not_required'
export type InvoiceStatusFilter = 'all' | 'pending' | 'uploaded' | 'not_required'
export type CategoryFilter = 'all' | PaymentCategory

export type InvoiceFilters = {
  status: InvoiceStatusFilter
  category: CategoryFilter
  /** Include mock and gift rows next to real iyzico charges. */
  showTest: boolean
  /** YYYY-MM-DD, Europe/Istanbul calendar days, inclusive. */
  from: string
  to: string
  q: string
  page: number
}

export const DEFAULT_INVOICE_FILTERS: InvoiceFilters = {
  status: 'pending',
  category: 'all',
  showTest: false,
  from: '',
  to: '',
  q: '',
  page: 1,
}

export type InvoiceRecordSummary = {
  id: string
  status: InvoiceStatus
  invoiceNumber: string | null
  invoiceDate: string | null
  fileName: string | null
  source: string
  notRequiredReason: string | null
  updatedAt: string
}

/** Delivery state of the latest "invoice ready" email for an uploaded invoice. */
export type InvoiceEmailState = 'not_sent' | 'sending' | 'sent' | 'sent_without_attachment' | 'failed'

export type InvoiceEmailStatus = {
  state: InvoiceEmailState
  /** ISO time the latest event was sent, when it was. */
  sentAt: string | null
}

export type AdminInvoiceRow = {
  transactionId: string
  transactionNumber: string
  createdAt: string
  userId: string | null
  email: string
  fullName: string
  provider: string
  category: PaymentCategory
  description: string
  amountKurus: number
  currency: string
  /** Real iyzico charge with an amount: the rows that are expected to get an invoice. */
  expectsInvoice: boolean
  invoice: InvoiceRecordSummary | null
  /** null until the page rows are enriched. */
  profileComplete: boolean | null
  /** Only set for uploaded invoices once the page rows are enriched. */
  emailStatus?: InvoiceEmailStatus | null
}

export type InvoiceCounts = { pending: number; uploaded: number; not_required: number; total: number }

export type InvoiceListResult = {
  available: boolean
  rows: AdminInvoiceRow[]
  total: number
  page: number
  pageSize: number
  counts: InvoiceCounts
  truncated: boolean
}

export type InvoiceActionError =
  | 'unauthorized'
  | 'rate_limited'
  | 'invalid_input'
  | 'invalid_number'
  | 'invalid_date'
  | 'invalid_reason'
  | 'too_large'
  | 'unsupported_type'
  | 'active_content'
  | 'not_found'
  | 'not_eligible'
  | 'already_invoiced'
  | 'not_reopenable'
  | 'number_taken'
  | 'conflict'
  | 'storage_failed'
  | 'save_failed'
  | 'audit_failed'
  | 'no_recipient'
  | 'email_in_progress'
  | 'unavailable'
