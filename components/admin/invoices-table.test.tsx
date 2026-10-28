import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  INVOICES_ACTIONS_CELL_CLASS,
  INVOICES_TABLE_CLASS,
  INVOICES_TABLE_COLUMNS,
  INVOICES_TABLE_MIN_WIDTH_PX,
  InvoicesTable,
} from '@/components/admin/invoices-table'
import { InvoiceRowActions, PRIMARY_SLOT_CLASS } from '@/components/admin/invoice-row-actions'
import { HistoryInvoiceActionButton } from '@/components/billing/history-invoice-action'
import { PaymentHistoryRow } from '@/components/billing/payment-history-row'
import { getInvoiceCopy } from '@/lib/invoices/copy'
import type { AdminInvoiceRow } from '@/lib/invoices/types'

const c = getInvoiceCopy('tr')
const dateFmt = new Intl.DateTimeFormat('tr-TR')

function row(overrides: Partial<AdminInvoiceRow> = {}): AdminInvoiceRow {
  return {
    transactionId: 't1',
    transactionNumber: 'TX-1',
    createdAt: '2026-01-01T10:00:00Z',
    userId: 'u1',
    email: 'a@b.co',
    fullName: 'Ada Lovelace',
    provider: 'iyzico',
    category: 'subscription',
    description: 'Pro',
    amountKurus: 29900,
    currency: 'TRY',
    expectsInvoice: true,
    invoice: null,
    profileComplete: true,
    ...overrides,
  }
}

const uploadedInvoice = {
  id: 'inv-1',
  status: 'uploaded' as const,
  invoiceNumber: 'GLV-2026-0001',
  invoiceDate: '2026-01-02',
  fileName: 'f.pdf',
  source: 'manual',
  notRequiredReason: null,
  updatedAt: '2026-01-02T10:00:00Z',
}

function renderTable(rows: AdminInvoiceRow[]) {
  return renderToStaticMarkup(
    <InvoicesTable
      rows={rows}
      copy={c}
      selectable={rows}
      selected={new Set()}
      allSelected={false}
      dateFmt={dateFmt}
      onToggle={() => {}}
      onToggleAll={() => {}}
      onAction={() => {}}
    />,
  )
}

describe('admin fatura tablosu düzeni', () => {
  it('sütun genişliklerinin toplamı tablonun min-genişliğine eşit', () => {
    expect(INVOICES_TABLE_MIN_WIDTH_PX).toBe(1084)
    expect(INVOICES_TABLE_CLASS).toContain(`min-w-[${INVOICES_TABLE_MIN_WIDTH_PX}px]`)
    expect(INVOICES_TABLE_CLASS).toContain('table-fixed')
  })

  it('işlem sütunu sabit genişlikte ve sticky; sadece o sütun sticky', () => {
    const actions = INVOICES_TABLE_COLUMNS.find((column) => column.key === 'actions')
    expect(actions?.px).toBe(176)
    const html = renderTable([row()])
    expect(INVOICES_ACTIONS_CELL_CLASS).toContain('sticky right-0')
    expect(html.match(/sticky/g)?.length).toBe(2) // başlık + gövde hücresi
  })

  it('tüm sütun başlıkları görünür', () => {
    const html = renderTable([row()])
    for (const label of [c.colDate, c.colCustomer, c.colType, c.colAmount, c.colStatus, c.colActions]) {
      expect(html).toContain(label)
    }
  })

  it('yüklü satırda fatura no + tarih Fatura sütununda, "Değiştir" birincil eylem', () => {
    const html = renderTable([row({ invoice: uploadedInvoice })])
    expect(html).toContain('GLV-2026-0001')
    expect(html).toContain(dateFmt.format(new Date('2026-01-02T12:00:00')))
    expect(html).toContain(c.replace)
  })
})

describe('satır eylemleri', () => {
  const render = (r: AdminInvoiceRow) => renderToStaticMarkup(<InvoiceRowActions row={r} copy={c} onAction={() => {}} />)

  it('bekleyen satır: "Fatura yükle" + erişilebilir "⋯" menü düğmesi', () => {
    const html = render(row())
    expect(html).toContain(c.upload)
    expect(html).toContain(`aria-label="${c.moreActions}"`)
    expect(html).toContain('aria-haspopup="menu"')
  })

  it('birincil eylem alanı her durumda aynı sabit genişlikte', () => {
    const slot = `class="${PRIMARY_SLOT_CLASS}"`
    expect(render(row())).toContain(slot)
    expect(render(row({ invoice: uploadedInvoice }))).toContain(slot)
    expect(render(row({ expectsInvoice: false }))).toContain(slot)
  })

  it('fatura beklenmeyen satırda yükle düğmesi yok ama menü var', () => {
    const html = render(row({ expectsInvoice: false }))
    expect(html).not.toContain(c.upload)
    expect(html).toContain(`aria-label="${c.moreActions}"`)
  })
})

describe('müşteri ödeme geçmişi satırı', () => {
  const txn = { id: 't1', kind: 'charge', status: 'succeeded', provider: 'iyzico', amount_cents: 29900 }
  const action = (invoices: Record<string, never> = {}) => (
    <HistoryInvoiceActionButton
      txn={txn}
      copy={c}
      invoicesByTransaction={invoices}
      invoiceNotRequiredIds={[]}
      invoicesAvailable
    />
  )
  const html = (node: React.ReactNode) =>
    renderToStaticMarkup(
      <ul>
        <PaymentHistoryRow
          title="Abonelik"
          dateText="1 Oca 2026"
          amountText="299,00 ₺"
          amountNegative={false}
          statusLabel="Başarılı"
          statusTone="success"
          invoiceAction={node}
        />
      </ul>,
    )

  it('fatura eylemi sağ kolonda, tutar ve durumun altında; sol kolonda değil', () => {
    const out = html(action())
    const [left, right] = out.split('data-slot="history-right"')
    expect(left).not.toContain(c.myInvoicePending)
    expect(right).toContain(c.myInvoicePending)
    expect(right.indexOf('299,00')).toBeLessThan(right.indexOf('Başarılı'))
    expect(right.indexOf('Başarılı')).toBeLessThan(right.indexOf(c.myInvoicePending))
    expect(out).toContain('items-end')
  })

  it('dar ekranda kısa etiket, tam etiket ekran okuyucuya', () => {
    const out = html(action())
    expect(out).toContain(c.myInvoicePendingShort)
    expect(out).toContain('sr-only sm:hidden')
  })

  it('eylem yokken sağ kolon boş eylem alanı gizli (empty:hidden)', () => {
    const none = html(<HistoryInvoiceActionButton txn={{ ...txn, status: 'failed' }} copy={c} invoicesByTransaction={{}} invoiceNotRequiredIds={[]} invoicesAvailable />)
    expect(none).toContain('empty:hidden')
    expect(none).not.toContain(c.myInvoicePending)
  })
})
