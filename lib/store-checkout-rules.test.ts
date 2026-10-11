import { describe, expect, it } from 'vitest'
import {
  COD_FEE_MAX_CENTS,
  buildPaymentSummary,
  computeOrderTotals,
  formatCodFeeInput,
  isCheckoutAllowed,
  isSelectableCardProvider,
  isValidCodFeeCents,
  orderCodFeeCents,
  parseCodFeeInput,
} from './store-checkout-rules'

describe('parseCodFeeInput', () => {
  it('treats blank as zero', () => {
    expect(parseCodFeeInput('')).toBe(0)
    expect(parseCodFeeInput('   ')).toBe(0)
    expect(parseCodFeeInput(undefined)).toBe(0)
  })

  it('parses whole and decimal amounts with comma or dot', () => {
    expect(parseCodFeeInput('12')).toBe(1200)
    expect(parseCodFeeInput('12,5')).toBe(1250)
    expect(parseCodFeeInput('12.50')).toBe(1250)
    expect(parseCodFeeInput('0,05')).toBe(5)
    expect(parseCodFeeInput(7)).toBe(700)
  })

  it('accepts the cap and rejects anything above it', () => {
    expect(parseCodFeeInput('1000')).toBe(COD_FEE_MAX_CENTS)
    expect(parseCodFeeInput('1000,01')).toBeNull()
    expect(parseCodFeeInput('99999')).toBeNull()
  })

  it('rejects negative, non-numeric and over-precise input', () => {
    expect(parseCodFeeInput('-5')).toBeNull()
    expect(parseCodFeeInput('abc')).toBeNull()
    expect(parseCodFeeInput('1,234')).toBeNull()
    expect(parseCodFeeInput('1e3')).toBeNull()
    expect(parseCodFeeInput('123456')).toBeNull()
  })
})

describe('isValidCodFeeCents / formatCodFeeInput', () => {
  it('validates integer cents within range', () => {
    expect(isValidCodFeeCents(0)).toBe(true)
    expect(isValidCodFeeCents(COD_FEE_MAX_CENTS)).toBe(true)
    expect(isValidCodFeeCents(COD_FEE_MAX_CENTS + 1)).toBe(false)
    expect(isValidCodFeeCents(-1)).toBe(false)
    expect(isValidCodFeeCents(1.5)).toBe(false)
    expect(isValidCodFeeCents('100')).toBe(false)
  })

  it('round-trips through the owner input format', () => {
    expect(formatCodFeeInput(0)).toBe('')
    expect(formatCodFeeInput(1200)).toBe('12')
    expect(formatCodFeeInput(1250)).toBe('12,50')
    expect(formatCodFeeInput(5)).toBe('0,05')
    for (const cents of [1, 99, 100, 1250, COD_FEE_MAX_CENTS]) {
      expect(parseCodFeeInput(formatCodFeeInput(cents))).toBe(cents)
    }
  })
})

describe('isSelectableCardProvider', () => {
  it('only allows paytr for now', () => {
    expect(isSelectableCardProvider('paytr')).toBe(true)
    expect(isSelectableCardProvider('iyzico')).toBe(false)
    expect(isSelectableCardProvider(undefined)).toBe(false)
  })
})

describe('computeOrderTotals', () => {
  const base = { subtotalCents: 10_000, shippingCents: 2_000, codFeeCents: 1_500 }

  it('adds the fee for cash on delivery only', () => {
    expect(computeOrderTotals({ ...base, providerId: 'cash_on_delivery' })).toEqual({
      subtotalCents: 10_000,
      shippingCents: 2_000,
      codFeeCents: 1_500,
      totalCents: 13_500,
    })
  })

  it('never charges the fee on card or bank transfer orders', () => {
    for (const providerId of ['paytr', 'iyzico', 'bank_transfer']) {
      const totals = computeOrderTotals({ ...base, providerId })
      expect(totals.codFeeCents).toBe(0)
      expect(totals.totalCents).toBe(12_000)
    }
  })

  it('ignores an out-of-range fee instead of trusting it', () => {
    const totals = computeOrderTotals({
      ...base,
      providerId: 'cash_on_delivery',
      codFeeCents: COD_FEE_MAX_CENTS + 1,
    })
    expect(totals.codFeeCents).toBe(0)
    expect(totals.totalCents).toBe(12_000)
  })
})

describe('orderCodFeeCents', () => {
  const order = { subtotal_cents: 10_000, shipping_cents: 2_000, total_cents: 13_500 }

  it('is zero for non cash-on-delivery orders', () => {
    expect(orderCodFeeCents({ ...order, payment_provider: 'paytr' })).toBe(0)
    expect(orderCodFeeCents({ ...order, payment_provider: null })).toBe(0)
  })

  it('prefers the stored column', () => {
    expect(
      orderCodFeeCents({ ...order, payment_provider: 'cash_on_delivery', cod_fee_cents: 1_500 }),
    ).toBe(1_500)
  })

  it('derives the fee from the remainder when the column is missing', () => {
    expect(orderCodFeeCents({ ...order, payment_provider: 'cash_on_delivery' })).toBe(1_500)
    expect(
      orderCodFeeCents({ ...order, payment_provider: 'cash_on_delivery', total_cents: 11_000 }),
    ).toBe(0)
  })
})

describe('isCheckoutAllowed', () => {
  it('allows guests only when guest checkout is on', () => {
    expect(isCheckoutAllowed(true, null)).toBe(true)
    expect(isCheckoutAllowed(false, null)).toBe(false)
    expect(isCheckoutAllowed(false, 'customer-1')).toBe(true)
  })
})

describe('buildPaymentSummary', () => {
  const closed = {
    cardEnabled: false,
    cardReady: false,
    cardUnreadable: false,
    bankEnabled: false,
    bankIbanValid: false,
    codEnabled: false,
    activeCardProvider: 'paytr' as const,
    guestCheckout: true,
    codFeeCents: 0,
  }

  it('reports no enabled method as closed', () => {
    const s = buildPaymentSummary(closed)
    expect(s.ordersOpen).toBe(false)
    expect(s.closedReason).toBe('none_enabled')
  })

  it('reports enabled-but-unready methods with their problem', () => {
    const s = buildPaymentSummary({ ...closed, cardEnabled: true, bankEnabled: true })
    expect(s.ordersOpen).toBe(false)
    expect(s.closedReason).toBe('none_ready')
    expect(s.modules.find((m) => m.id === 'card')?.problem).toBe('card_not_tested')
    expect(s.modules.find((m) => m.id === 'bank_transfer')?.problem).toBe('iban_missing')
  })

  it('flags an unreadable card config distinctly', () => {
    const s = buildPaymentSummary({ ...closed, cardEnabled: true, cardUnreadable: true })
    expect(s.modules.find((m) => m.id === 'card')?.problem).toBe('card_unreadable')
  })

  it('opens orders as soon as one method is ready', () => {
    const s = buildPaymentSummary({ ...closed, codEnabled: true, codFeeCents: 1_500 })
    expect(s.ordersOpen).toBe(true)
    expect(s.closedReason).toBeNull()
    expect(s.codFeeCents).toBe(1_500)
  })
})
