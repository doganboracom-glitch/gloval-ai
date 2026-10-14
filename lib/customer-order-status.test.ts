import { describe, expect, it } from 'vitest'
import { COD_RECEIVED_COPY, customerOrderStatus, customerOrderStatusKey } from '@/lib/customer-order-status'
import { buildBankTransferInstructions, formatBankDueDate } from '@/lib/bank-transfer-instructions'

describe('customerOrderStatus', () => {
  it('shows a cash-on-delivery order as received with the COD copy, not as awaiting payment', () => {
    const s = customerOrderStatus({ status: 'pending', paymentStatus: 'pending', paymentProvider: 'cash_on_delivery' }, 'tr')
    expect(s.key).toBe('received')
    expect(s.title).toBe('Siparişiniz alındı')
    expect(s.description).toBe(COD_RECEIVED_COPY.tr.description)
  })

  it('shows a bank-transfer order as awaiting payment', () => {
    const s = customerOrderStatus({ status: 'pending', paymentStatus: 'pending', paymentProvider: 'bank_transfer' }, 'tr')
    expect(s.key).toBe('awaiting_payment')
    expect(s.label).toBe('Ödeme bekleniyor')
  })

  it('moves a paid order to preparing', () => {
    expect(customerOrderStatusKey({ status: 'paid', paymentStatus: 'paid', paymentProvider: 'bank_transfer' })).toBe('preparing')
  })

  it('lets cancelled win over a default preparing shipping status', () => {
    expect(
      customerOrderStatusKey({ status: 'cancelled', paymentStatus: 'pending', paymentProvider: 'bank_transfer', shippingStatus: 'preparing' }),
    ).toBe('cancelled')
  })

  it('maps shipping states', () => {
    expect(customerOrderStatusKey({ status: 'paid', paymentStatus: 'paid', shippingStatus: 'in_transit' })).toBe('shipped')
    expect(customerOrderStatusKey({ status: 'paid', paymentStatus: 'paid', shippingStatus: 'delivered' })).toBe('delivered')
  })

  it('treats a COD order that is shipped as shipped', () => {
    expect(
      customerOrderStatusKey({ status: 'pending', paymentStatus: 'pending', paymentProvider: 'cash_on_delivery', shippingStatus: 'shipped' }),
    ).toBe('shipped')
  })
})

describe('buildBankTransferInstructions', () => {
  const config = { bankName: 'Banka', accountHolder: 'Ad', iban: 'TR330006100519786457841326', instructions: 'Not', termDays: 3 } as never
  const order = {
    id: 'abcdef12-0000-0000-0000-000000000000',
    created_at: '2026-01-10T09:00:00.000Z',
    status: 'pending',
    payment_status: 'pending',
    payment_provider: 'bank_transfer',
  }

  it('returns instructions with reference and due date while awaiting payment', () => {
    const data = buildBankTransferInstructions(config, order)
    expect(data?.reference).toBe('ABCDEF12')
    expect(data?.dueAt).toBe('2026-01-13T09:00:00.000Z')
    expect(formatBankDueDate(data!.dueAt, 'tr')).toBe('13 Ocak 2026')
  })

  it('hides instructions once paid, cancelled or for other providers', () => {
    expect(buildBankTransferInstructions(config, { ...order, payment_status: 'paid', status: 'paid' })).toBeNull()
    expect(buildBankTransferInstructions(config, { ...order, status: 'cancelled' })).toBeNull()
    expect(buildBankTransferInstructions(config, { ...order, payment_provider: 'cash_on_delivery' })).toBeNull()
    expect(buildBankTransferInstructions(null, order)).toBeNull()
  })
})
