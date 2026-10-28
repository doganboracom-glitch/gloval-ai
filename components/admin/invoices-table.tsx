import { StatusBadge } from '@/components/admin/admin-ui'
import { InvoiceRowActions, type InvoiceRowAction } from '@/components/admin/invoice-row-actions'
import type { InvoiceCopy } from '@/lib/invoices/copy'
import { formatKurus } from '@/lib/invoices/scope'
import type { AdminInvoiceRow, InvoiceEmailState, InvoiceEmailStatus } from '@/lib/invoices/types'

/**
 * Narrowest width the admin content column ever has at the `lg` breakpoint and
 * above: the shell is `max-w-6xl` (1152px) with 24px side padding, a 208px
 * sidebar and a 32px gap, so 1152 - 48 - 208 - 32 = 864px. That is the same at
 * 1280px and 1920px, so the table must fit in it with no horizontal scrolling.
 */
export const ADMIN_CONTENT_WIDTH_PX = 864

/**
 * Same fixed layout for every filter combination: the table never sizes itself
 * from its content, so long reasons or names can't push columns out of view.
 * `px` is the real width of each column and their sum is the table's min-width.
 * Nothing is sticky: a sticky actions column used to sit on top of the "Tutar"
 * and "Fatura" columns whenever the table was wider than its container.
 */
export const INVOICES_TABLE_COLUMNS = [
  { key: 'select', widthClass: 'w-8', px: 32 },
  { key: 'date', widthClass: 'w-32', px: 128 },
  { key: 'customer', widthClass: 'w-[140px]', px: 140 },
  { key: 'type', widthClass: 'w-[100px]', px: 100 },
  { key: 'amount', widthClass: 'w-[120px]', px: 120 },
  { key: 'invoice', widthClass: 'w-[150px]', px: 150 },
  { key: 'actions', widthClass: 'w-[188px]', px: 188 },
] as const

export const INVOICES_TABLE_MIN_WIDTH_PX = INVOICES_TABLE_COLUMNS.reduce((sum, column) => sum + column.px, 0)

export const INVOICES_TABLE_SCROLL_CLASS = 'max-w-full overflow-x-auto rounded-xl border border-border bg-card'
export const INVOICES_TABLE_CLASS = 'w-full min-w-[858px] table-fixed border-collapse text-sm'
export const INVOICES_CELL_CLASS = 'px-2 py-3 align-middle'
export const INVOICES_HEAD_CLASS = 'px-2 py-2.5 font-medium whitespace-nowrap'
export const INVOICES_ACTIONS_CELL_CLASS = 'px-2 py-3 text-right align-middle'
export const INVOICES_ACTIONS_HEAD_CLASS = 'px-2 py-2.5 text-right font-medium whitespace-nowrap'

export type { InvoiceRowAction }

type Props = {
  rows: AdminInvoiceRow[]
  copy: InvoiceCopy
  selectable: AdminInvoiceRow[]
  selected: ReadonlySet<string>
  allSelected: boolean
  dateFmt: Intl.DateTimeFormat
  onToggle: (transactionId: string) => void
  onToggleAll: () => void
  onAction: (action: InvoiceRowAction, row: AdminInvoiceRow) => void
}

function RowStatus({ row, copy }: { row: AdminInvoiceRow; copy: InvoiceCopy }) {
  if (row.invoice?.status === 'uploaded') return <StatusBadge tone="success" label={copy.statusUploaded} />
  if (row.invoice?.status === 'not_required') return <StatusBadge tone="muted" label={copy.statusNotRequired} />
  if (!row.expectsInvoice) return <StatusBadge tone="muted" label={copy.statusTest} />
  return <StatusBadge tone="warning" label={copy.statusPending} />
}

const EMAIL_TONE: Record<InvoiceEmailState, string> = {
  not_sent: 'text-muted-foreground',
  sending: 'text-muted-foreground',
  sent: 'text-muted-foreground',
  sent_without_attachment: 'text-amber-600 dark:text-amber-400',
  failed: 'text-destructive',
}

function EmailStatusLine({ status, copy }: { status: InvoiceEmailStatus; copy: InvoiceCopy }) {
  const label = {
    not_sent: copy.emailNotSent,
    sending: copy.emailSending,
    sent: copy.emailSent,
    sent_without_attachment: copy.emailSentNoAttachment,
    failed: copy.emailFailed,
  }[status.state]
  return (
    <span data-slot="invoice-email-status" className={`mt-1 block truncate text-xs ${EMAIL_TONE[status.state]}`} title={label}>
      {label}
    </span>
  )
}

export function InvoicesTable({ rows, copy: c, selectable, selected, allSelected, dateFmt, onToggle, onToggleAll, onAction }: Props) {
  return (
    <div className={INVOICES_TABLE_SCROLL_CLASS}>
      <table className={INVOICES_TABLE_CLASS}>
        <colgroup>
          {INVOICES_TABLE_COLUMNS.map((column) => (
            <col key={column.key} className={column.widthClass} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className={INVOICES_HEAD_CLASS}>
              <input type="checkbox" aria-label={c.selectAll} checked={allSelected} onChange={onToggleAll} />
            </th>
            <th className={INVOICES_HEAD_CLASS}>{c.colDate}</th>
            <th className={INVOICES_HEAD_CLASS}>{c.colCustomer}</th>
            <th className={INVOICES_HEAD_CLASS}>{c.colType}</th>
            <th className={`${INVOICES_HEAD_CLASS} text-right`}>{c.colAmount}</th>
            <th className={INVOICES_HEAD_CLASS}>{c.colStatus}</th>
            <th className={INVOICES_ACTIONS_HEAD_CLASS}>{c.colActions}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const uploaded = row.invoice?.status === 'uploaded'
            const canSelect = selectable.includes(row)
            const customer = row.fullName || row.email
            return (
              <tr key={row.transactionId} className="group border-b border-border/60 last:border-0 hover:bg-muted/40">
                <td className={INVOICES_CELL_CLASS}>
                  {canSelect ? (
                    <input type="checkbox" aria-label={c.selectRow} checked={selected.has(row.transactionId)} onChange={() => onToggle(row.transactionId)} />
                  ) : null}
                </td>
                <td className={`${INVOICES_CELL_CLASS} text-xs text-muted-foreground`}>
                  <span className="block truncate">{dateFmt.format(new Date(row.createdAt))}</span>
                  <span className="block truncate font-mono">{row.transactionNumber}</span>
                </td>
                <td className={INVOICES_CELL_CLASS}>
                  <span className="block truncate font-medium" title={customer}>
                    {customer}
                  </span>
                  {row.fullName ? (
                    <span className="block truncate text-xs text-muted-foreground" title={row.email}>
                      {row.email}
                    </span>
                  ) : null}
                  {row.expectsInvoice && !uploaded && row.profileComplete === false ? (
                    <span className="mt-1 block truncate text-xs text-amber-600 dark:text-amber-400" title={c.profileIncomplete}>
                      {c.profileIncomplete}
                    </span>
                  ) : null}
                </td>
                <td className={INVOICES_CELL_CLASS}>
                  <span className="block truncate">{c.categories[row.category]}</span>
                  <span className="block truncate text-xs text-muted-foreground" title={row.description}>
                    {row.description}
                  </span>
                </td>
                <td className={`${INVOICES_CELL_CLASS} text-right font-mono whitespace-nowrap`}>{formatKurus(row.amountKurus)}</td>
                <td className={INVOICES_CELL_CLASS}>
                  <RowStatus row={row} copy={c} />
                  {row.invoice?.invoiceNumber ? (
                    <span className="mt-1 block truncate font-mono text-xs text-muted-foreground" title={row.invoice.invoiceNumber}>
                      {row.invoice.invoiceNumber}
                    </span>
                  ) : null}
                  {uploaded && row.invoice?.invoiceDate ? (
                    <span className="block truncate text-xs text-muted-foreground">{dateFmt.format(new Date(`${row.invoice.invoiceDate}T12:00:00`))}</span>
                  ) : null}
                  {uploaded && row.emailStatus ? <EmailStatusLine status={row.emailStatus} copy={c} /> : null}
                  {row.invoice?.notRequiredReason ? (
                    <span className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground" title={row.invoice.notRequiredReason}>
                      {row.invoice.notRequiredReason}
                    </span>
                  ) : null}
                </td>
                <td className={INVOICES_ACTIONS_CELL_CLASS}>
                  <InvoiceRowActions row={row} copy={c} onAction={onAction} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
