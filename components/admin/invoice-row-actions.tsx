'use client'

import { Menu } from '@base-ui/react/menu'
import { Ellipsis } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import type { InvoiceCopy } from '@/lib/invoices/copy'
import type { AdminInvoiceRow } from '@/lib/invoices/types'

export type InvoiceRowAction = 'upload' | 'details' | 'convert' | 'reopen' | 'resend'

/** Width of the primary-action slot; identical in every row so the actions column never changes size. */
export const PRIMARY_SLOT_CLASS = 'flex w-28 justify-end'

const ITEM_CLASS =
  'flex w-full cursor-default items-center rounded-md px-2.5 py-1.5 text-sm text-foreground outline-none select-none data-[highlighted]:bg-muted'

type Props = {
  row: AdminInvoiceRow
  copy: InvoiceCopy
  onAction: (action: InvoiceRowAction, row: AdminInvoiceRow) => void
}

/**
 * One primary action ("Fatura yükle" / "Değiştir") plus a "⋯" menu holding the secondary ones.
 * The slot widths are fixed, so rows in any state render the same footprint.
 */
export function InvoiceRowActions({ row, copy: c, onAction }: Props) {
  const uploaded = row.invoice?.status === 'uploaded' && row.invoice
  return (
    <div data-slot="invoice-row-actions" className="flex flex-nowrap items-center justify-end gap-1.5">
      <div className={PRIMARY_SLOT_CLASS}>
        {row.expectsInvoice ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onAction('upload', row)}>
            {uploaded ? c.replace : c.upload}
          </Button>
        ) : null}
      </div>
      <Menu.Root>
        <Menu.Trigger
          aria-label={c.moreActions}
          title={c.moreActions}
          className={buttonVariants({ size: 'icon-sm', variant: 'ghost' })}
        >
          <Ellipsis className="size-4" aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={4} className="z-50">
            <Menu.Popup className="min-w-44 rounded-lg border border-border bg-card p-1 shadow-lg outline-none">
              {uploaded ? (
                <Menu.LinkItem
                  href={`/api/admin/invoices/${uploaded.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ITEM_CLASS}
                >
                  {c.myInvoiceDownload}
                </Menu.LinkItem>
              ) : null}
              {uploaded ? (
                <Menu.Item className={ITEM_CLASS} onClick={() => onAction('resend', row)}>
                  {row.emailStatus?.state === 'failed' ? c.emailRetry : row.emailStatus?.state === 'not_sent' ? c.emailSend : c.emailResend}
                </Menu.Item>
              ) : null}
              {uploaded ? (
                <Menu.Item className={ITEM_CLASS} onClick={() => onAction('convert', row)}>
                  {c.convert}
                </Menu.Item>
              ) : null}
              {row.invoice?.status === 'not_required' ? (
                <Menu.Item className={ITEM_CLASS} onClick={() => onAction('reopen', row)}>
                  {c.reopen}
                </Menu.Item>
              ) : null}
              <Menu.Item className={ITEM_CLASS} onClick={() => onAction('details', row)}>
                {c.details}
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  )
}
