import { FileDown, Hourglass } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import type { InvoiceCopy } from '@/lib/invoices/copy'
import { resolveHistoryInvoiceAction, type HistoryInvoiceAction } from '@/lib/invoices/history-action'
import type { MyInvoice } from '@/lib/invoices/customer'

type Transaction = Parameters<typeof resolveHistoryInvoiceAction>[0]

type Props = {
  txn: Transaction
  copy: InvoiceCopy
  invoicesByTransaction: Record<string, MyInvoice>
  invoiceNotRequiredIds: readonly string[]
  invoicesAvailable: boolean
}

export function HistoryInvoiceActionButton({ txn, copy, invoicesByTransaction, invoiceNotRequiredIds, invoicesAvailable }: Props) {
  const action: HistoryInvoiceAction = resolveHistoryInvoiceAction(txn, {
    byTransaction: invoicesByTransaction,
    notRequiredIds: invoiceNotRequiredIds,
    available: invoicesAvailable,
  })
  if (!action) return null

  if (action.kind === 'download') {
    return (
      <a
        href={`/api/invoices/${action.invoice.id}/download`}
        target="_blank"
        rel="noopener noreferrer"
        title={action.invoice.invoiceNumber}
        className={buttonVariants({ size: 'sm', variant: 'outline' })}
      >
        <FileDown className="size-3.5" aria-hidden />
        {copy.myInvoiceDownload}
      </a>
    )
  }

  return (
    <span
      title={copy.myInvoicePendingHint}
      className={`${buttonVariants({ size: 'sm', variant: 'outline' })} cursor-default opacity-70`}
      aria-disabled="true"
    >
      <Hourglass className="size-3.5" aria-hidden />
      {copy.myInvoicePending}
      <span className="sr-only">{copy.myInvoicePendingHint}</span>
    </span>
  )
}
