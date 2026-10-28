import { createClient } from '@/lib/supabase/server'

export type MyInvoice = { id: string; invoiceNumber: string; invoiceDate: string }

export type MyInvoiceState = {
  /** Uploaded invoices keyed by billing transaction id. */
  byTransaction: Record<string, MyInvoice>
  /** Payments the owner has marked "no invoice needed". */
  notRequiredIds: string[]
  /** False when the lookup failed, so the page shows neither links nor a "being prepared" note. */
  available: boolean
}

/**
 * Invoice state of the signed-in customer's payments.
 * Reads through the user's own session: RLS plus the column grant on
 * `invoices` expose only these non-sensitive fields of the owner's rows.
 * Any failure degrades to "unavailable" so the billing page never breaks.
 */
export async function getMyInvoiceState(): Promise<MyInvoiceState> {
  const unavailable: MyInvoiceState = { byTransaction: {}, notRequiredIds: [], available: false }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('invoices')
      .select('id, billing_transaction_id, status, invoice_number, invoice_date')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error || !data) return unavailable
    const byTransaction: Record<string, MyInvoice> = {}
    const notRequiredIds: string[] = []
    for (const row of data) {
      if (row.status === 'not_required') {
        notRequiredIds.push(row.billing_transaction_id)
        continue
      }
      if (row.status !== 'uploaded' || !row.invoice_number || !row.invoice_date) continue
      byTransaction[row.billing_transaction_id] = {
        id: row.id,
        invoiceNumber: row.invoice_number,
        invoiceDate: row.invoice_date,
      }
    }
    return { byTransaction, notRequiredIds, available: true }
  } catch (err) {
    console.error('[billing] invoices unavailable', err)
    return unavailable
  }
}
