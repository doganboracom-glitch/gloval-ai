import { createClient } from '@/lib/supabase/server'

export type MyInvoice = { id: string; invoiceNumber: string; invoiceDate: string }

/**
 * Uploaded invoices of the signed-in customer, keyed by billing transaction.
 * Reads through the user's own session: RLS plus the column grant on
 * `invoices` expose only these non-sensitive fields of the owner's rows.
 * Any failure degrades to "no invoices" so the billing page never breaks.
 */
export async function getMyInvoicesByTransaction(): Promise<Record<string, MyInvoice>> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('invoices')
      .select('id, billing_transaction_id, invoice_number, invoice_date')
      .eq('status', 'uploaded')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error || !data) return {}
    const byTransaction: Record<string, MyInvoice> = {}
    for (const row of data) {
      if (!row.invoice_number || !row.invoice_date) continue
      byTransaction[row.billing_transaction_id] = {
        id: row.id,
        invoiceNumber: row.invoice_number,
        invoiceDate: row.invoice_date,
      }
    }
    return byTransaction
  } catch (err) {
    console.error('[billing] invoices unavailable', err)
    return {}
  }
}
