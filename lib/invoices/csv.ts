import { serializeCsv } from '@/lib/billing-profile-csv'
import { formatKurus, splitVat } from '@/lib/invoices/scope'
import type { AdminInvoiceRow } from '@/lib/invoices/types'

export const INVOICE_CSV_HEADER = [
  'Islem No',
  'Tarih',
  'Musteri e-posta',
  'Musteri adi',
  'Urun turu',
  'Aciklama',
  'Saglayici',
  'Brut tutar (KDV dahil)',
  'KDV haric tutar',
  'KDV tutari',
  'Para birimi',
  'Fatura durumu',
  'Fatura no',
  'Fatura tarihi',
  'Fatura gerekmez nedeni',
] as const

const STATUS_LABEL = { pending: 'Bekliyor', uploaded: 'Yuklendi', not_required: 'Gerekmez' } as const

/** Turkish calendar date of a timestamp (Istanbul is UTC+3 all year). */
function istanbulDate(iso: string): string {
  const shifted = new Date(Date.parse(iso) + 3 * 60 * 60 * 1000)
  return Number.isNaN(shifted.getTime()) ? '' : shifted.toISOString().slice(0, 10)
}

/**
 * Accountant-facing export: amounts in plain decimal lira with a comma, VAT
 * split out at 20%. Cells starting with a formula character are neutralised
 * by `serializeCsv`. Billing profile data (tax or identity numbers, address)
 * is deliberately not part of this file.
 */
export function buildInvoicesCsv(rows: AdminInvoiceRow[]): string {
  const body = rows.map((row) => {
    const { net, vat } = splitVat(row.amountKurus)
    const state = row.invoice ? row.invoice.status : 'pending'
    return [
      row.transactionNumber,
      istanbulDate(row.createdAt),
      row.email,
      row.fullName,
      row.category,
      row.description,
      row.provider,
      formatKurus(row.amountKurus),
      formatKurus(net),
      formatKurus(vat),
      row.currency,
      STATUS_LABEL[state],
      row.invoice?.invoiceNumber ?? '',
      row.invoice?.invoiceDate ?? '',
      row.invoice?.notRequiredReason ?? '',
    ]
  })
  return serializeCsv([[...INVOICE_CSV_HEADER], ...body])
}
