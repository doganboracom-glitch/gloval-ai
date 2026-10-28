import type { ReactNode } from 'react'

export type PaymentHistoryTone = 'success' | 'failed' | 'neutral'

type Props = {
  title: string
  description?: string | null
  dateText: string
  amountText: string
  amountNegative: boolean
  statusLabel: string
  statusTone: PaymentHistoryTone
  /** Invoice action; rendered under the amount and status, right-aligned. Empty renders nothing. */
  invoiceAction?: ReactNode
}

const STATUS_CLASS: Record<PaymentHistoryTone, string> = {
  success: 'bg-success/15 text-success-strong',
  failed: 'bg-destructive/15 text-destructive',
  neutral: 'bg-muted text-muted-foreground',
}

export function PaymentHistoryRow({ title, description, dateText, amountText, amountNegative, statusLabel, statusTone, invoiceAction }: Props) {
  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3.5 sm:px-5">
      <div data-slot="history-left" className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        <p className="mt-0.5 text-xs text-muted-foreground">{dateText}</p>
      </div>
      <div data-slot="history-right" className="flex shrink-0 flex-col items-end gap-1 text-right">
        <span className={`font-mono text-sm font-medium ${amountNegative ? 'text-accent' : 'text-foreground'}`}>{amountText}</span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[statusTone]}`}>{statusLabel}</span>
        <div data-slot="history-invoice-action" className="mt-1 flex justify-end empty:hidden">
          {invoiceAction}
        </div>
      </div>
    </li>
  )
}
