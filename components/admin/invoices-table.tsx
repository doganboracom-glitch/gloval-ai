import { StatusBadge } from '@/components/admin/admin-ui'
import { InvoiceRowActions, type InvoiceRowAction } from '@/components/admin/invoice-row-actions'
import type { InvoiceCopy } from '@/lib/invoices/copy'
import { formatKurus } from '@/lib/invoices/scope'
import type { AdminInvoiceRow } from '@/lib/invoices/types'

/**
 * Same fixed layout for every filter combination: the table never sizes itself
 * from its content, so long reasons or names can't push the actions out of view.
 * `px` is the real width of each column; the table's min-width is their sum, so
 * the sticky actions column only overlaps others once the user scrolls sideways.
 */
export const INVOICES_TABLE_COLUMNS = [
  { key: 'select', widthClass: 'w-11', px: 44 },
  { key: 'date', widthClass: 'w-40', px: 160 },
  { key: 'customer', widthClass: 'w-56', px: 224 },
  { key: 'type', widthClass: 'w-48', px: 192 },
  { key: 'amount', widthClass: 'w-28', px: 112 },
  { key: 'invoice', widthClass: 'w-44', px: 176 },
  { key: 'actions', widthClass: 'w-44', px: 176 },
] as const

export const INVOICES_TABLE_MIN_WIDTH_PX = INVOICES_TABLE_COLUMNS.reduce((sum, column) => sum + column.px, 0)

export const INVOICES_TABLE_SCROLL_CLASS = 'max-w-full overflow-x-auto rounded-xl border border-border bg-card'
export const INVOICES_TABLE_CLASS = 'w-full min-w-[1084px] table-fixed border-collapse text-sm'
export const INVOICES_ACTIONS_CELL_CLASS =
  'sticky right-0 z-10 bg-card px-3 py-3 text-right align-middle shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)]'
export const INVOICES_ACTIONS_HEAD_CLASS =
  'sticky right-0 z-10 bg-card px-3 py-2.5 text-right font-medium whitespace-nowrap shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)]'

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
            <th className="px-4 py-2.5 font-medium">
              <input type="checkbox" aria-label={c.selectAll} checked={allSelected} onChange={onToggleAll} />
            </th>
            <th className="px-4 py-2.5 font-medium whitespace-nowrap">{c.colDate}</th>
            <th className="px-4 py-2.5 font-medium whitespace-nowrap">{c.colCustomer}</th>
            <th className="px-4 py-2.5 font-medium whitespace-nowrap">{c.colType}</th>
            <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">{c.colAmount}</th>
            <th className="px-4 py-2.5 font-medium whitespace-nowrap">{c.colStatus}</th>
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
                <td className="px-4 py-3 align-middle">
                  {canSelect ? (
                    <input type="checkbox" aria-label={c.selectRow} checked={selected.has(row.transactionId)} onChange={() => onToggle(row.transactionId)} />
                  ) : null}
                </td>
                <td className="px-4 py-3 align-middle text-xs text-muted-foreground">
                  <span className="block truncate">{dateFmt.format(new Date(row.createdAt))}</span>
                  <span className="block truncate font-mono">{row.transactionNumber}</span>
                </td>
                <td className="px-4 py-3 align-middle">
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
                <td className="px-4 py-3 align-middle">
                  <span className="block truncate">{c.categories[row.category]}</span>
                  <span className="block truncate text-xs text-muted-foreground" title={row.description}>
                    {row.description}
                  </span>
                </td>
                <td className="px-4 py-3 text-right align-middle font-mono whitespace-nowrap">{formatKurus(row.amountKurus)}</td>
                <td className="px-4 py-3 align-middle">
                  <RowStatus row={row} copy={c} />
                  {row.invoice?.invoiceNumber ? (
                    <span className="mt-1 block truncate font-mono text-xs text-muted-foreground" title={row.invoice.invoiceNumber}>
                      {row.invoice.invoiceNumber}
                    </span>
                  ) : null}
                  {uploaded && row.invoice?.invoiceDate ? (
                    <span className="block truncate text-xs text-muted-foreground">{dateFmt.format(new Date(`${row.invoice.invoiceDate}T12:00:00`))}</span>
                  ) : null}
                  {row.invoice?.notRequiredReason ? (
                    <span className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground" title={row.invoice.notRequiredReason}>
                      {row.invoice.notRequiredReason}
                    </span>
                  ) : null}
                </td>
                <td className={`${INVOICES_ACTIONS_CELL_CLASS} group-hover:bg-muted`}>
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
