import type { InvoiceEmailStatus } from '@/lib/invoices/types'

export type InvoiceEmailEvent = {
  status: 'pending' | 'processing' | 'sent' | 'failed'
  attachment_state: string | null
  file_sha256: string | null
  sent_at: string | null
  created_at: string
}

/**
 * Status of the latest "invoice ready" email for the invoice's CURRENT file.
 * Events for a file that has since been replaced do not count, so a replaced
 * invoice honestly reads "not sent" until its new email goes out.
 */
export function deriveInvoiceEmailStatus(events: InvoiceEmailEvent[], currentSha256: string | null): InvoiceEmailStatus {
  if (!currentSha256) return { state: 'not_sent', sentAt: null }
  const latest = events
    .filter((event) => event.file_sha256 === currentSha256)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
  if (!latest) return { state: 'not_sent', sentAt: null }
  if (latest.status === 'pending' || latest.status === 'processing') return { state: 'sending', sentAt: null }
  if (latest.status === 'failed') return { state: 'failed', sentAt: null }
  return {
    state: latest.attachment_state === 'omitted' ? 'sent_without_attachment' : 'sent',
    sentAt: latest.sent_at,
  }
}
