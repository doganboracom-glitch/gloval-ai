import { describe, expect, it } from 'vitest'
import { resolveHistoryInvoiceAction } from '@/lib/invoices/history-action'

const INVOICE = { id: 'inv-1', invoiceNumber: 'GLV-1', invoiceDate: '2026-01-01' }

const charge = { id: 't1', kind: 'charge', status: 'succeeded', provider: 'iyzico', amount_cents: 29900 }

function state(overrides: Partial<Parameters<typeof resolveHistoryInvoiceAction>[1]> = {}) {
  return { byTransaction: {}, notRequiredIds: [], available: true, ...overrides }
}

describe('müşteri ödeme geçmişi fatura eylemi', () => {
  it('yüklü fatura -> indir', () => {
    const action = resolveHistoryInvoiceAction(charge, state({ byTransaction: { t1: INVOICE } }))
    expect(action).toEqual({ kind: 'download', invoice: INVOICE })
  })

  it('yüklü değil -> pasif "hazırlanıyor"', () => {
    expect(resolveHistoryInvoiceAction(charge, state())).toEqual({ kind: 'preparing' })
  })

  it('proration_debit de faturalanabilir', () => {
    expect(resolveHistoryInvoiceAction({ ...charge, kind: 'proration_debit' }, state())).toEqual({ kind: 'preparing' })
  })

  it('"Fatura gerekmez" -> eylem yok', () => {
    expect(resolveHistoryInvoiceAction(charge, state({ notRequiredIds: ['t1'] }))).toBeNull()
  })

  it.each(['failed', 'abandoned', 'pending'])('%s ödeme -> eylem yok', (status) => {
    expect(resolveHistoryInvoiceAction({ ...charge, status }, state({ byTransaction: { t1: INVOICE } }))).toBeNull()
  })

  it('iade ve kredi satırları -> eylem yok', () => {
    expect(resolveHistoryInvoiceAction({ ...charge, kind: 'refund', amount_cents: -29900 }, state())).toBeNull()
    expect(resolveHistoryInvoiceAction({ ...charge, kind: 'proration_credit', amount_cents: -500 }, state())).toBeNull()
  })

  it('iyzico dışı veya tutarı 0 olan satır -> eylem yok', () => {
    expect(resolveHistoryInvoiceAction({ ...charge, provider: 'manual' }, state())).toBeNull()
    expect(resolveHistoryInvoiceAction({ ...charge, amount_cents: 0 }, state())).toBeNull()
  })

  it('fatura sorgusu hata verdiyse -> gizli', () => {
    expect(resolveHistoryInvoiceAction(charge, state({ available: false }))).toBeNull()
    expect(resolveHistoryInvoiceAction(charge, state({ available: false, byTransaction: { t1: INVOICE } }))).toBeNull()
  })
})
