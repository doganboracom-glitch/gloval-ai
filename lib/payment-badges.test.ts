import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { PaymentBadges } from '@/components/payment-badges'
import { resolveStorePayment } from './store-payment-policy'
import {
  PLATFORM_PAYMENT_BADGES,
  STORE_BASE_PAYMENT_BADGES,
  hasAnyPaymentBadge,
  resolveStorePaymentBadges,
  type PaymentBadgeSet,
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

const BASE: PaymentBadgeSet = {
  iyzico: true,
  mastercard: true,
  visa: true,
  amex: false,
  troy: false,
  bankTransfer: false,
  cashOnDelivery: false,
}

describe('resolveStorePaymentBadges', () => {
  it('always keeps iyzico + Mastercard + Visa, even without a usable resolution', () => {
    expect(resolveStorePaymentBadges(null)).toEqual(BASE)
    expect(resolveStorePaymentBadges({ ok: false, reason: 'config_unreadable' })).toEqual(BASE)
  })

  it('keeps only the base logos for demo stores and the mock provider', () => {
    expect(resolveStorePaymentBadges(ok(['iyzico'], { demo: true }))).toEqual(BASE)
    expect(resolveStorePaymentBadges(ok(['mock']))).toEqual(BASE)
  })

  it('adds Amex and Troy only while iyzico is the live card provider', () => {
    expect(resolveStorePaymentBadges(ok(['iyzico']))).toEqual({ ...BASE, amex: true, troy: true })
  })

  it('adds only chips for manual methods, never Amex/Troy', () => {
    expect(resolveStorePaymentBadges(ok(['bank_transfer', 'cash_on_delivery']))).toEqual({
      ...BASE,
      bankTransfer: true,
      cashOnDelivery: true,
    })
  })
})

describe('footer payment strip rules', () => {
  const html = (badges: PaymentBadgeSet | null, variant?: 'platform' | 'site') =>
    renderToStaticMarkup(createElement(PaymentBadges, { badges, variant }))
  const row = (providers: string[], overrides: Record<string, unknown> = {}) => ({
    provider: providers[0],
    enabled: true,
    enabled_providers: providers,
    active_card_provider: 'iyzico',
    ...overrides,
  })
  const logos = (out: string) => [...out.matchAll(/data-payment-logo="(\w+)"/g)].map((m) => m[1])

  it('(a) iyzico + Mastercard + Visa show whether or not a card provider is active', () => {
    for (const cardReady of [true, false]) {
      const res = resolveStorePayment(row(['iyzico']), false, false, false, cardReady)
      expect(logos(html(resolveStorePaymentBadges(res), 'site'))).toEqual(
        cardReady ? ['iyzico', 'mastercard', 'visa', 'amex', 'troy'] : ['iyzico', 'mastercard', 'visa'],
      )
    }
    const unconfigured = resolveStorePayment(null, false, false, false, true)
    expect(logos(html(resolveStorePaymentBadges(unconfigured), 'site'))).toEqual([
      'iyzico',
      'mastercard',
      'visa',
    ])
    const manualOnly = html(resolveStorePaymentBadges(ok(['bank_transfer'])), 'site')
    expect(logos(manualOnly)).toEqual(['iyzico', 'mastercard', 'visa'])
  })

  it('(b) Amex and Troy are hidden unless iyzico is the live card provider', () => {
    const cardsNotReady = resolveStorePayment(
      row(['iyzico', 'bank_transfer', 'cash_on_delivery']),
      false,
      false,
      false,
      false,
    )
    const badges = resolveStorePaymentBadges(cardsNotReady)
    expect(badges).toEqual({ ...BASE, bankTransfer: true, cashOnDelivery: true })
    const out = html(badges, 'site')
    expect(out).toContain('Havale / EFT')
    expect(out).toContain('Kapıda ödeme')
    expect(out).not.toContain('American Express')
    expect(out).not.toContain('Troy')

    const live = resolveStorePaymentBadges(
      resolveStorePayment(row(['iyzico']), false, false, false, true),
    )
    expect(live.amex && live.troy).toBe(true)
  })

  it('(c) manual chips render only when the method is enabled', () => {
    const onlyCod = resolveStorePaymentBadges(
      resolveStorePayment(row(['iyzico', 'cash_on_delivery']), false, false, false, false),
    )
    expect(html(onlyCod, 'site')).toContain('Kapıda ödeme')
    expect(html(onlyCod, 'site')).not.toContain('Havale / EFT')
    const disabled = resolveStorePaymentBadges(
      resolveStorePayment(row(['bank_transfer'], { enabled: false }), false, false, false, true),
    )
    expect(html(disabled, 'site')).not.toContain('Havale / EFT')
    expect(html(disabled, 'site')).not.toContain('Kapıda ödeme')
    expect(
      html({
        iyzico: false,
        mastercard: false,
        visa: false,
        amex: false,
        troy: false,
        bankTransfer: false,
        cashOnDelivery: false,
      }),
    ).toBe('')
  })

  it('(d) corporate (non-store) sites never resolve a strip', () => {
    const page = readFileSync(path.resolve(__dirname, '..', 'components/site/public-site-view.tsx'), 'utf8')
    expect(page).toContain(
      'isStorefront(site.schema) ? await getStorePaymentBadges(slug) : null',
    )
  })

  it('(e) the gloval.ai footer shows all five logos from the shared component, with no caption', () => {
    const out = html(PLATFORM_PAYMENT_BADGES)
    expect(logos(out)).toEqual(['iyzico', 'mastercard', 'visa', 'amex', 'troy'])
    for (const file of ['iyzico-logo', 'mastercard', 'visa', 'amex', 'troy']) {
      expect(out).toContain(`/payment/${file}.svg`)
    }
    expect(out).not.toMatch(/Güvenli Ödeme|Secure Payment/i)
    expect(out).not.toContain('Havale / EFT')
    expect(out).not.toContain('Kapıda ödeme')
  })

  it('(f) store and platform strips render the same logo files', () => {
    const store = html(resolveStorePaymentBadges(ok(['iyzico'])), 'site')
    const platform = html(PLATFORM_PAYMENT_BADGES)
    const srcs = (out: string) => [...out.matchAll(/src="([^"]+)"/g)].map((m) => m[1])
    expect(srcs(store)).toEqual(srcs(platform))
  })

  it('(g) logo files exist and are not stretched', () => {
    for (const file of ['iyzico-logo', 'mastercard', 'visa', 'amex', 'troy']) {
      const svg = readFileSync(path.resolve(__dirname, '..', 'public/payment', `${file}.svg`), 'utf8')
      expect(svg).toContain('viewBox=')
    }
    const out = html(PLATFORM_PAYMENT_BADGES)
    expect(out).toContain('h-5 w-auto')
    expect(out).not.toMatch(/object-fill/)
  })

  it('store base set is exactly iyzico + Mastercard + Visa', () => {
    expect(STORE_BASE_PAYMENT_BADGES).toEqual(BASE)
  })
})

describe('hasAnyPaymentBadge', () => {
  it('is true for the platform set and false for empty input', () => {
    expect(hasAnyPaymentBadge(PLATFORM_PAYMENT_BADGES)).toBe(true)
    expect(hasAnyPaymentBadge(null)).toBe(false)
  })
})
