import type { MyInvoice } from '@/lib/invoices/customer'

export type HistoryInvoiceAction = { kind: 'download'; invoice: MyInvoice } | { kind: 'preparing' } | null

type HistoryTransaction = {
  id: string
  kind: string
  status: string
  provider: string
  amount_cents: number
}

type HistoryInvoiceState = {
  byTransaction: Record<string, MyInvoice>
  notRequiredIds: readonly string[]
  available: boolean
}

/** A real iyzico charge the customer could be invoiced for. */
export function isInvoiceableTransaction(txn: HistoryTransaction): boolean {
  return (
    txn.status === 'succeeded' &&
    txn.provider === 'iyzico' &&
    (txn.kind === 'charge' || txn.kind === 'proration_debit') &&
    txn.amount_cents > 0
  )
}

/**
 * Which invoice action a payment-history row shows.
 * Only successful real charges get one; a failed invoice lookup hides it
 * everywhere so the history itself keeps rendering.
 */
export function resolveHistoryInvoiceAction(txn: HistoryTransaction, state: HistoryInvoiceState): HistoryInvoiceAction {
  if (!state.available || !isInvoiceableTransaction(txn)) return null
  if (state.notRequiredIds.includes(txn.id)) return null
  const invoice = state.byTransaction[txn.id]
  return invoice ? { kind: 'download', invoice } : { kind: 'preparing' }
}
