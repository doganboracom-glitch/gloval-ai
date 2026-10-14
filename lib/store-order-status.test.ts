import { describe, expect, it } from 'vitest'
import { orderStatusCopy, safeStoreContactHref, isSafeStoreBaseUrl } from '@/lib/store-order-status'
import { canAccessOrder } from '@/lib/store-order-privacy'

describe('orderStatusCopy', () => {
  const cases = [
    ['pending', 'paid', 'Siparişiniz alındı!', 'Siparişiniz alındı.', 'Your order was received', 'Your order has been received.'],
    ['preparing', 'paid', 'Siparişiniz hazırlanıyor', 'Siparişiniz hazırlanıyor.', 'Your order is being prepared', 'Your order is being prepared.'],
    ['shipped', 'paid', 'Siparişiniz kargoda', 'Siparişiniz kargoya verildi.', 'Your order is on its way', 'Your order has been handed to the carrier.'],
    ['cancelled', 'paid', 'Siparişiniz iptal edildi', 'Bu sipariş artık işleme alınmıyor.', 'Your order was cancelled', 'This order is no longer being processed.'],
    ['refunded', 'paid', 'Siparişiniz iade edildi', 'Bu siparişin ödemesi iade edildi.', 'Your order was refunded', 'The payment for this order has been refunded.'],
    ['failed', 'failed', 'Ödeme başarısız', 'Bu siparişin ödemesi tamamlanamadı.', 'Payment failed', 'The payment for this order could not be completed.'],
  ] as const

  it.each(cases)('returns title and description for %s in Turkish and English', (status, paymentStatus, trTitle, trDescription, enTitle, enDescription) => {
    expect(orderStatusCopy({ status, paymentStatus }, 'tr')).toMatchObject({ title: trTitle, description: trDescription })
    expect(orderStatusCopy({ status, paymentStatus }, 'en')).toMatchObject({ title: enTitle, description: enDescription })
  })

  it('uses the shipping status for delivered orders', () => {
    expect(orderStatusCopy({ status: 'processing', paymentStatus: 'paid', shippingStatus: 'delivered' }, 'tr')).toMatchObject({
      title: 'Siparişiniz teslim edildi!',
      description: 'Siparişiniz teslim edildi.',
    })
  })

  it('includes carrier tracking details for shipped orders', () => {
    expect(orderStatusCopy({ status: 'processing', paymentStatus: 'paid', shippingStatus: 'shipped', carrier: 'Yurtiçi', trackingNumber: '123' }, 'tr').description).toContain('Yurtiçi · 123')
  })

  it('returns a safe fallback when the status is unknown', () => {
    expect(orderStatusCopy({ status: 'unknown', paymentStatus: 'paid' }, 'en')).toMatchObject({
      title: 'Your order was received',
      description: 'Your order has been received.',
    })
  })

  it('returns a contact fallback for a hidden contact section', () => {
    expect(safeStoreContactHref('https://demo.gloval.site', false, 'store@example.com', 'demo')).toBe('mailto:store@example.com')
  })

  it('does not use another tenant gloval.site address', () => {
    expect(safeStoreContactHref('https://other.gloval.site', true, 'store@example.com', 'demo')).toBe('mailto:store@example.com')
  })

  it('does not create a link when no contact channel exists', () => {
    expect(safeStoreContactHref('https://other.gloval.site', true, null, 'demo')).toBeNull()
  })

  it('rejects a missing signed token and non-owner session', () => {
    expect(canAccessOrder({ orderProjectId: 'p1', slugProjectId: 'p1', tokenValid: false, sessionOwnsOrder: false })).toBe(false)
  })

  it('rejects another store even with a valid signed token', () => {
    expect(canAccessOrder({ orderProjectId: 'p1', slugProjectId: 'p2', tokenValid: true, sessionOwnsOrder: false })).toBe(false)
  })
})

describe('legacy individual status assertions', () => {
  it('returns Turkish title and description for delivered order', () => {
    expect(orderStatusCopy({ status: 'delivered', paymentStatus: 'paid' }, 'tr')).toMatchObject({
      title: 'Siparişiniz teslim edildi!',
      description: 'Siparişiniz teslim edildi.',
    })
  })

  it('returns English title and description for delivered order', () => {
    expect(orderStatusCopy({ status: 'delivered', paymentStatus: 'paid' }, 'en')).toMatchObject({
      title: 'Your order was delivered',
      description: 'Your order has been delivered.',
    })
  })

  it('returns Turkish title for pending order', () => {
    expect(orderStatusCopy({ status: 'pending', paymentStatus: 'paid' }, 'tr').title).toBe(
      'Siparişiniz alındı!'
    )
  })

  it('returns English title for pending order', () => {
    expect(orderStatusCopy({ status: 'pending', paymentStatus: 'paid' }, 'en').title).toBe(
      'Your order was received'
    )
  })

  it('returns Turkish title for preparing order', () => {
    expect(orderStatusCopy({ status: 'preparing', paymentStatus: 'paid' }, 'tr').title).toBe(
      'Siparişiniz hazırlanıyor'
    )
  })

  it('returns English title for preparing order', () => {
    expect(orderStatusCopy({ status: 'preparing', paymentStatus: 'paid' }, 'en').title).toBe(
      'Your order is being prepared'
    )
  })

  it('returns Turkish title for shipped order', () => {
    expect(orderStatusCopy({ status: 'shipped', paymentStatus: 'paid' }, 'tr').title).toBe(
      'Siparişiniz kargoda'
    )
  })

  it('returns English title for shipped order', () => {
    expect(orderStatusCopy({ status: 'shipped', paymentStatus: 'paid' }, 'en').title).toBe(
      'Your order is on its way'
    )
  })

  it('returns Turkish title for cancelled order', () => {
    expect(orderStatusCopy({ status: 'cancelled', paymentStatus: 'paid' }, 'tr').title).toBe(
      'Siparişiniz iptal edildi'
    )
  })

  it('returns English title for cancelled order', () => {
    expect(orderStatusCopy({ status: 'cancelled', paymentStatus: 'paid' }, 'en').title).toBe(
      'Your order was cancelled'
    )
  })

  it('returns Turkish title for refunded order', () => {
    expect(orderStatusCopy({ status: 'refunded', paymentStatus: 'paid' }, 'tr').title).toBe(
      'Siparişiniz iade edildi'
    )
  })

  it('returns English title for refunded order', () => {
    expect(orderStatusCopy({ status: 'refunded', paymentStatus: 'paid' }, 'en').title).toBe(
      'Your order was refunded'
    )
  })

  it('returns Turkish title for failed payment', () => {
    expect(orderStatusCopy({ status: 'failed', paymentStatus: 'failed' }, 'tr').title).toBe(
      'Ödeme başarısız'
    )
  })

  it('returns English title for failed payment', () => {
    expect(orderStatusCopy({ status: 'failed', paymentStatus: 'failed' }, 'en').title).toBe(
      'Payment failed'
    )
  })
})

describe('safeStoreContactHref', () => {
  it('returns contact anchor for active custom domain', () => {
    expect(safeStoreContactHref('https://shop.example.com', true, null, 'demo')).toBe(
      'https://shop.example.com/#contact'
    )
  })

  it('returns mailto for valid email', () => {
    expect(safeStoreContactHref(null, false, 'store@example.com', 'demo')).toBe(
      'mailto:store@example.com'
    )
  })

  it('returns null for missing contact', () => {
    expect(safeStoreContactHref(null, false, null, 'demo')).toBeNull()
  })

  it('returns null for invalid email', () => {
    expect(safeStoreContactHref(null, false, 'not-an-email', 'demo')).toBeNull()
  })
})

describe('isSafeStoreBaseUrl', () => {
  it('accepts exact tenant domain', () => {
    expect(isSafeStoreBaseUrl('https://demo.gloval.site', 'demo')).toBe(true)
  })

  it('rejects different tenant domain', () => {
    expect(isSafeStoreBaseUrl('https://other.gloval.site', 'demo')).toBe(false)
  })

  it('rejects external domain', () => {
    expect(isSafeStoreBaseUrl('https://evil.example.com', 'demo')).toBe(false)
  })

  it('rejects non-HTTPS', () => {
    expect(isSafeStoreBaseUrl('http://demo.gloval.site', 'demo')).toBe(false)
  })

  it('rejects domain with attacker suffix', () => {
    expect(isSafeStoreBaseUrl('https://demo.gloval.site.evil.test', 'demo')).toBe(false)
  })
})

describe('canAccessOrder', () => {
  it('allows access with valid token', () => {
    expect(
      canAccessOrder({
        orderProjectId: 'p1',
        slugProjectId: 'p1',
        tokenValid: true,
        sessionOwnsOrder: false,
      })
    ).toBe(true)
  })

  it('allows access with owner session', () => {
    expect(
      canAccessOrder({
        orderProjectId: 'p1',
        slugProjectId: 'p1',
        tokenValid: false,
        sessionOwnsOrder: true,
      })
    ).toBe(true)
  })

  it('denies access without credentials', () => {
    expect(
      canAccessOrder({
        orderProjectId: 'p1',
        slugProjectId: 'p1',
        tokenValid: false,
        sessionOwnsOrder: false,
      })
    ).toBe(false)
  })

  it('denies access for mismatched projects', () => {
    expect(
      canAccessOrder({
        orderProjectId: 'p1',
        slugProjectId: 'p2',
        tokenValid: true,
        sessionOwnsOrder: false,
      })
    ).toBe(false)
  })

  it('denies access for null slug project', () => {
    expect(
      canAccessOrder({
        orderProjectId: 'p1',
        slugProjectId: null,
        tokenValid: true,
        sessionOwnsOrder: false,
      })
    ).toBe(false)
  })
})
