import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { PaymentBadges } from '@/components/payment-badges'
import { resolveStorePayment } from './store-payment-policy'
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

describe('footer payment strip rules', () => {
  const html = (badges: Parameters<typeof PaymentBadges>[0]['badges'], variant?: 'platform' | 'site') =>
    renderToStaticMarkup(createElement(PaymentBadges, { badges, variant }))
  const row = (providers: string[], overrides: Record<string, unknown> = {}) => ({
    provider: providers[0],
    enabled: true,
    enabled_providers: providers,
    active_card_provider: 'iyzico',
    ...overrides,
  })

  it('(a) hides card and iyzico logos when the card method is not usable', () => {
    for (const cardReady of [true, false]) {
      const res = resolveStorePayment(row(['iyzico']), false, false, false, cardReady)
      expect(resolveStorePaymentBadges(res)).toBeNull()
    }
    const unconfigured = resolveStorePayment(null, false, false, false, true)
    expect(resolveStorePaymentBadges(unconfigured)).toBeNull()
    const out = html(resolveStorePaymentBadges(ok(['bank_transfer'])), 'site')
    expect(out).not.toContain('iyzico')
    expect(out).not.toContain('card-logos')
  })

  it('(b) while cards are "coming soon", stores show only the enabled manual labels', () => {
    const res = resolveStorePayment(
      row(['iyzico', 'bank_transfer', 'cash_on_delivery']),
      false,
      false,
      false,
      true,
    )
    const badges = resolveStorePaymentBadges(res)
    expect(badges).toEqual({
      cards: false,
      iyzico: false,
      bankTransfer: true,
      cashOnDelivery: true,
    })
    const out = html(badges, 'site')
    expect(out).toContain('Havale / EFT')
    expect(out).toContain('Kapıda ödeme')
    expect(out).not.toContain('<img')
    const onlyCod = resolveStorePaymentBadges(
      resolveStorePayment(row(['iyzico', 'cash_on_delivery']), false, false, false, true),
    )
    expect(html(onlyCod, 'site')).toContain('Kapıda ödeme')
    expect(html(onlyCod, 'site')).not.toContain('Havale / EFT')
  })

  it('(c) renders no strip at all when no method is enabled', () => {
    const disabled = resolveStorePayment(row(['bank_transfer'], { enabled: false }), false, false, false, true)
    expect(resolveStorePaymentBadges(disabled)).toBeNull()
    expect(html(resolveStorePaymentBadges(disabled), 'site')).toBe('')
    expect(
      html({ cards: false, iyzico: false, bankTransfer: false, cashOnDelivery: false }),
    ).toBe('')
  })

  it('(d) corporate (non-store) sites never resolve a strip', () => {
    const page = readFileSync(path.resolve(__dirname, '..', 'app/site/[slug]/page.tsx'), 'utf8')
    expect(page).toContain(
      'isStorefront(site.schema) ? await getStorePaymentBadges(slug) : null',
    )
  })

  it('(e) the gloval.ai footer keeps iyzico + card logos and no "Güvenli Ödeme" text', () => {
    const out = html(PLATFORM_PAYMENT_BADGES)
    expect(out).toContain('/payment/iyzico-logo.svg')
    expect(out).toContain('/payment/card-logos.svg')
    expect(out).toContain('Mastercard, Visa, American Express, Troy')
    expect(out).not.toMatch(/Güvenli Ödeme|Secure Payment/i)
    expect(out).not.toContain('Havale / EFT')
    expect(out).not.toContain('Kapıda ödeme')
  })
})

describe('hasAnyPaymentBadge', () => {
  it('is true for the platform set and false for empty input', () => {
    expect(hasAnyPaymentBadge(PLATFORM_PAYMENT_BADGES)).toBe(true)
    expect(hasAnyPaymentBadge(null)).toBe(false)
  })
})
