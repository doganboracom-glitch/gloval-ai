import { describe, expect, it } from 'vitest'
import { buildShippingView, cartTotalCents, productShippingLine, shippingRowValue } from './store-shipping-display'

const settings = { feeCents: 500, freeThresholdCents: 2_000, defaultCarrier: null, deliveryNote: '1-3 iş günü' }

describe('store-shipping-display', () => {
  it('mirrors the calculation and adds COD to the total', () => {
    expect(buildShippingView(1_000, settings, 'tr')).toMatchObject({ shippingCents: 500, free: false, hint: 'Ücretsiz kargo için ₺10 daha ekleyin' })
    expect(cartTotalCents(1_000, settings, 300)).toBe(1_800)
    expect(cartTotalCents(2_000, settings, 300)).toBe(2_300)
  })

  it('renders localized text and omits no-setting hints', () => {
    expect(shippingRowValue(0, (c) => `money:${c}`, 'tr')).toBe('Ücretsiz')
    expect(shippingRowValue(500, (c) => `money:${c}`, 'en')).toBe('money:500')
    expect(buildShippingView(100, { feeCents: 0, freeThresholdCents: null, defaultCarrier: null, deliveryNote: null })).toMatchObject({ hint: null, progress: null })
    expect(productShippingLine(settings)).toBe('Kargo ₺5, ₺20 ve üzeri ücretsiz · 1-3 iş günü')
  })
})
