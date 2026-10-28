import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPPORT_EMAIL, sendTransactionalEmailDetailed } from '@/lib/notify'
import { buildInvoiceReadyEmail } from '@/lib/email/invoice-ready'
import type { EmailLang } from '@/lib/email/lang'
import { MAX_ATTEMPTS, classifyHttpFailure } from '@/lib/email-outbox-policy'
import { INVOICE_BUCKET, INVOICE_MAX_BYTES } from '@/lib/invoices/constants'
import { downloadFileName, isInvoiceStoragePath, sha256Hex } from '@/lib/invoices/pdf'
import { transactionNumberFor } from '@/lib/invoices/transaction-number'

const BILLING_URL = 'https://gloval.ai/billing'
const TX_COLUMNS = 'id, user_id, kind, amount_cents, currency, status, provider, provider_ref, description, idempotency_key, created_at'

export type InvoiceEventRow = {
  id: string
  invoice_id: string | null
  file_sha256: string | null
  attempts: number
}

export type InvoiceDeliveryOutcome =
  | { type: 'sent'; messageId: string | null; attachment: { state: 'attached' | 'omitted'; reason: string | null } }
  | { type: 'retry'; code: string }
  | { type: 'fail'; code: string }
  | { type: 'defer' }

type InvoiceForEmail = {
  status: string
  invoice_number: string | null
  invoice_date: string | null
  amount_kurus: number | null
  currency: string | null
  file_path: string | null
  file_sha256: string | null
  billing_transaction_id: string
}

type AttachmentLoad =
  | { ok: true; base64: string }
  | { ok: false; reason: 'storage_unavailable' | 'checksum_mismatch' | 'too_large'; final: boolean }

async function loadAttachment(invoice: InvoiceForEmail, expectedSha256: string): Promise<AttachmentLoad> {
  if (!isInvoiceStoragePath(invoice.file_path)) return { ok: false, reason: 'storage_unavailable', final: false }
  const { data, error } = await createAdminClient().storage.from(INVOICE_BUCKET).download(invoice.file_path)
  if (error || !data) return { ok: false, reason: 'storage_unavailable', final: false }
  const bytes = new Uint8Array(await data.arrayBuffer())
  if (bytes.length > INVOICE_MAX_BYTES) return { ok: false, reason: 'too_large', final: true }
  if ((await sha256Hex(bytes)) !== expectedSha256) return { ok: false, reason: 'checksum_mismatch', final: false }
  return { ok: true, base64: Buffer.from(bytes).toString('base64') }
}

/**
 * Sends one "invoice ready" email. A missing attachment is retried like any
 * transient failure; only on the last attempt (or for an oversized file) is the
 * email sent without it, and that is recorded on the event so the admin screen
 * can tell the two apart.
 */
export async function deliverInvoiceReady(
  row: InvoiceEventRow,
  recipient: { email: string; lang: EmailLang; name?: string | null },
): Promise<InvoiceDeliveryOutcome> {
  if (!row.invoice_id || !row.file_sha256) return { type: 'fail', code: 'invoice_missing' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('invoices')
    .select('status, invoice_number, invoice_date, amount_kurus, currency, file_path, file_sha256, billing_transaction_id')
    .eq('id', row.invoice_id)
    .maybeSingle()
  if (error) return { type: 'retry', code: 'invoice_lookup_failed' }
  const invoice = data as InvoiceForEmail | null
  if (!invoice || invoice.status !== 'uploaded' || !invoice.invoice_number || !invoice.invoice_date) {
    return { type: 'fail', code: 'invoice_unavailable' }
  }
  // The file was replaced after this email was queued; the replacement has its own event.
  if (invoice.file_sha256 !== row.file_sha256) return { type: 'fail', code: 'superseded' }

  const { data: txData, error: txError } = await admin
    .from('billing_transactions')
    .select(TX_COLUMNS)
    .eq('id', invoice.billing_transaction_id)
    .maybeSingle()
  if (txError) return { type: 'retry', code: 'transaction_lookup_failed' }
  if (!txData) return { type: 'fail', code: 'transaction_missing' }
  const transactionNumber = transactionNumberFor(txData as Parameters<typeof transactionNumberFor>[0])

  const attachment = await loadAttachment(invoice, row.file_sha256)
  let omittedReason: string | null = null
  if (!attachment.ok) {
    if (!attachment.final && row.attempts < MAX_ATTEMPTS) return { type: 'retry', code: attachment.reason }
    omittedReason = attachment.reason
  }

  const email = buildInvoiceReadyEmail({
    lang: recipient.lang,
    name: recipient.name,
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoice.invoice_date,
    amountKurus: invoice.amount_kurus ?? 0,
    currency: invoice.currency ?? 'TRY',
    transactionNumber,
    attachmentIncluded: attachment.ok,
    billingUrl: BILLING_URL,
    supportEmail: SUPPORT_EMAIL,
  })

  const result = await sendTransactionalEmailDetailed({
    to: recipient.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    replyTo: SUPPORT_EMAIL,
    idempotencyKey: `email-event-${row.id}`,
    attachments: attachment.ok ? [{ filename: downloadFileName(invoice.invoice_number), content: attachment.base64 }] : undefined,
  })

  if (result.ok) {
    return {
      type: 'sent',
      messageId: result.messageId,
      attachment: attachment.ok ? { state: 'attached', reason: null } : { state: 'omitted', reason: omittedReason },
    }
  }
  if (result.reason === 'not_configured') return { type: 'defer' }
  const failure = classifyHttpFailure(result.reason === 'http' ? result.status : null)
  return failure.retryable ? { type: 'retry', code: failure.code } : { type: 'fail', code: failure.code }
}
