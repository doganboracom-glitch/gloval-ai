import { describe, expect, it } from 'vitest'
import { orderStatusCopy, safeStoreContactHref, isSafeStoreBaseUrl } from '@/lib/store-order-status'
import { canAccessOrder } from '@/lib/store-order-privacy'

describe('orderStatusCopy', () => {
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
