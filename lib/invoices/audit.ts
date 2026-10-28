import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { redactAuditDetail } from '@/lib/invoices/audit-redact'

export type InvoiceAuditAction =
  | 'invoice.upload'
  | 'invoice.replace'
  | 'invoice.mark_not_required'
  | 'invoice.download_admin'
  | 'invoice.download_customer'
  | 'invoice.export_csv'
  | 'invoice.reopen'

export type InvoiceAuditEntry = {
  actor: { userId: string; email: string }
  action: InvoiceAuditAction
  invoiceId?: string | null
  billingTransactionId?: string | null
  detail?: Record<string, unknown>
}

/**
 * Appends one row to `invoice_audit` (append-only, enforced by a trigger).
 * Returns false when the row could not be written so callers that must not
 * act without a trail (downloads) can refuse; mutations log and carry on.
 * `detail` is redacted: it can never carry identity numbers, addresses or the
 * billing snapshot.
 */
export async function recordInvoiceAudit(entry: InvoiceAuditEntry): Promise<boolean> {
  try {
    const { error } = await createAdminClient()
      .from('invoice_audit')
      .insert({
        actor_id: entry.actor.userId,
        actor_email: entry.actor.email,
        action: entry.action,
        invoice_id: entry.invoiceId ?? null,
        billing_transaction_id: entry.billingTransactionId ?? null,
        detail: entry.detail ? redactAuditDetail(entry.detail) : null,
      })
    if (error) {
      console.error('[invoice-audit] insert failed:', error.message)
      return false
    }
    return true
  } catch (error) {
    console.error('[invoice-audit] insert failed:', error instanceof Error ? error.message : error)
    return false
  }
}
