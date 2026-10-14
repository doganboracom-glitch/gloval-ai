import { describe, expect, it } from 'vitest'
import { customerOrderStatus, customerOrderStatusKey } from '@/lib/customer-order-status'

const refundedCard = { status: 'cancelled', paymentStatus: 'refunded', paymentProvider: 'iyzico' }

describe('customer sees a refunded card order', () => {
  it('shows "refunded" rather than "cancelled" once the payment was returned', () => {
    expect(customerOrderStatusKey(refundedCard)).toBe('refunded')
    expect(customerOrderStatusKey({ ...refundedCard, shippingStatus: 'cancelled' })).toBe('refunded')
  })

  it('uses Turkish copy', () => {
    const s = customerOrderStatus(refundedCard, 'tr')
    expect(s).toMatchObject({
      key: 'refunded',
      label: 'İade edildi',
      title: 'Siparişiniz iade edildi',
      description: 'Bu siparişin ödemesi iade edildi.',
      tone: 'muted',
    })
  })

  it('uses English copy', () => {
    const s = customerOrderStatus(refundedCard, 'en')
    expect(s).toMatchObject({
      key: 'refunded',
      label: 'Refunded',
      title: 'Your order was refunded',
      description: 'The payment for this order has been refunded.',
    })
  })

  it('does not call a refund still in progress "refunded": a paid order keeps its status', () => {
    expect(customerOrderStatusKey({ status: 'paid', paymentStatus: 'paid', paymentProvider: 'iyzico' })).toBe('preparing')
  })

  it('a plain cancelled bank-transfer order is still "cancelled", not "refunded"', () => {
    expect(customerOrderStatusKey({ status: 'cancelled', paymentStatus: 'pending', paymentProvider: 'bank_transfer' })).toBe('cancelled')
  })
})
