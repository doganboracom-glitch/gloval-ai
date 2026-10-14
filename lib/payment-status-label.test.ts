import { describe, expect, it } from 'vitest'
import { paymentStatusLabel } from '@/lib/payment-status-label'

describe('paymentStatusLabel', () => {
  it.each([
    ['failed', 'Başarısız'],
    ['pending', 'Beklemede'],
    ['paid', 'Ödendi'],
    ['refunded', 'İade edildi'],
  ])('shows %s as %s in Turkish', (status, label) => {
    expect(paymentStatusLabel(status, 'tr')).toBe(label)
    expect(paymentStatusLabel(status)).toBe(label)
  })

  it('never leaks the raw English database value into the Turkish panel', () => {
    for (const status of ['failed', 'pending', 'paid', 'refunded']) {
      expect(paymentStatusLabel(status, 'tr')).not.toBe(status)
    }
  })

  it('keeps English labels for the English panel', () => {
    expect(paymentStatusLabel('failed', 'en')).toBe('Failed')
    expect(paymentStatusLabel('refunded', 'en')).toBe('Refunded')
  })

  it('normalises case and whitespace, and falls back for unknown or empty values', () => {
    expect(paymentStatusLabel('  PAID ', 'tr')).toBe('Ödendi')
    expect(paymentStatusLabel('chargeback', 'tr')).toBe('Bilinmiyor')
    expect(paymentStatusLabel(null, 'tr')).toBe('Bilinmiyor')
    expect(paymentStatusLabel(undefined, 'en')).toBe('Unknown')
  })
})
