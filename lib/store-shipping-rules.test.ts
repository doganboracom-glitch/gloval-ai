import { describe, expect, it } from 'vitest'
import {
  FREE_SHIPPING_THRESHOLD_MAX_CENTS,
  SHIPPING_FEE_MAX_CENTS,
  computeShippingCents,
  freeShippingProgress,
  parseFreeThresholdInput,
  parseShippingFeeInput,
  readShippingSettings,
} from './store-shipping-rules'

const settings = (overrides: Record<string, unknown> = {}) => ({
  feeCents: 1_000,
  freeThresholdCents: 5_000,
  defaultCarrier: null,
  deliveryNote: null,
  ...overrides,
})

describe('shipping calculation', () => {
  it.each([[4_999, 1_000], [5_000, 0], [5_001, 0]])('charges correctly at %s', (subtotal, expected) => {
    expect(computeShippingCents(subtotal, settings())).toBe(expected)
  })

  it('is free with a zero fee or missing settings', () => {
    expect(computeShippingCents(0, settings({ feeCents: 0 }))).toBe(0)
    expect(computeShippingCents(1_000, readShippingSettings(undefined))).toBe(0)
    expect(freeShippingProgress(1_000, readShippingSettings(undefined))).toEqual({ kind: 'always_free' })
  })

  it('keeps the server and display boundary identical', () => {
    for (const subtotal of [0, 1, 4_999, 5_000, 99_999_999]) {
      expect(computeShippingCents(subtotal, settings())).toBe(
        subtotal >= 5_000 ? 0 : 1_000,
      )
    }
  })
})

describe('shipping settings limits', () => {
  it('accepts the fee boundaries and rejects outside them', () => {
    expect(parseShippingFeeInput('0')).toBe(0)
    expect(parseShippingFeeInput('1000')).toBe(SHIPPING_FEE_MAX_CENTS)
    expect(parseShippingFeeInput('1000,01')).toBeNull()
    expect(parseShippingFeeInput('-1')).toBeNull()
  })

  it('accepts the threshold boundary and rejects zero or above the cap', () => {
    expect(parseFreeThresholdInput('0,01')).toEqual({ ok: true, cents: 1 })
    expect(parseFreeThresholdInput(String(FREE_SHIPPING_THRESHOLD_MAX_CENTS / 100))).toEqual({
      ok: true,
      cents: FREE_SHIPPING_THRESHOLD_MAX_CENTS,
    })
    expect(parseFreeThresholdInput('0')).toEqual({ ok: false })
    expect(parseFreeThresholdInput('1000000')).toEqual({ ok: false })
  })

  it('ignores malformed stored values safely', () => {
    expect(readShippingSettings({ shipping_fee_cents: 100_001 })).toMatchObject({ feeCents: 0 })
    expect(readShippingSettings({ free_shipping_threshold_cents: 0 })).toMatchObject({
      freeThresholdCents: null,
    })
  })
})
