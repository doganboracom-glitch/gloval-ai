import { describe, expect, it } from 'vitest'
import {
  PLATFORM_PAYMENT_BADGES,
  hasAnyPaymentBadge,
  resolveStorePaymentBadges,
} from './payment-badges'
import type { StorePaymentResolution } from './store-payment-policy'

function ok(
  methods: string[],
  overrides: Partial<Extract<StorePaymentResolution, { ok: true }>> = {},
): StorePaymentResolution {
  return {
    ok: true,
    methods: methods as never,
    defaultProvider: methods[0] as never,
    publicConfig: {},
    demo: false,
    guestCheckout: true,
    codFeeCents: 0,
    ...overrides,
  }
}

describe('resolveStorePaymentBadges', () => {
  it('shows nothing for a missing or failed resolution', () => {
    expect(resolveStorePaymentBadges(null)).toBeNull()
    expect(resolveStorePaymentBadges({ ok: false, reason: 'config_unreadable' })).toBeNull()
  })

  it('shows nothing for demo stores and the mock provider', () => {
    expect(resolveStorePaymentBadges(ok(['iyzico'], { demo: true }))).toBeNull()
    expect(resolveStorePaymentBadges(ok(['mock']))).toBeNull()
  })

  it('shows card and iyzico marks when iyzico is live', () => {
    expect(resolveStorePaymentBadges(ok(['iyzico']))).toEqual({
      cards: true,
      iyzico: true,
      bankTransfer: false,
      cashOnDelivery: false,
    })
  })

  it('shows only chips for manual methods, never card logos', () => {
    expect(resolveStorePaymentBadges(ok(['bank_transfer', 'cash_on_delivery']))).toEqual({
      cards: false,
      iyzico: false,
      bankTransfer: true,
      cashOnDelivery: true,
    })
  })
})

describe('hasAnyPaymentBadge', () => {
  it('is true for the platform set and false for empty input', () => {
    expect(hasAnyPaymentBadge(PLATFORM_PAYMENT_BADGES)).toBe(true)
    expect(hasAnyPaymentBadge(null)).toBe(false)
  })
})
