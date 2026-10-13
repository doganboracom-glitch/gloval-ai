import type { StorePaymentResolution } from '@/lib/store-payment-policy'
import { isCardProviderMethod } from '@/lib/payments/methods'

/**
 * Which payment marks a footer strip may show. Pure data, no I/O.
 *
 * - `cards`: Visa / Mastercard / Amex / Troy
 * - `iyzico`: the iyzico mark
 * - `bankTransfer` / `cashOnDelivery`: small text chips, not logos
 */
export type PaymentBadgeSet = {
  cards: boolean
  iyzico: boolean
  bankTransfer: boolean
  cashOnDelivery: boolean
}

/** The gloval.ai (platform) footer always takes cards through iyzico. */
export const PLATFORM_PAYMENT_BADGES: PaymentBadgeSet = {
  cards: true,
  iyzico: true,
  bankTransfer: false,
  cashOnDelivery: false,
}

export function hasAnyPaymentBadge(badges: PaymentBadgeSet | null | undefined): boolean {
  return Boolean(
    badges && (badges.cards || badges.iyzico || badges.bankTransfer || badges.cashOnDelivery),
  )
}

/**
 * Derives the strip for a STORE from its resolved payment configuration, so the
 * footer can never advertise something checkout would not accept:
 *
 * - a method only counts when `resolveStorePayment` kept it (card providers are
 *   already filtered by "integrated" and "ready", fail closed);
 * - demo stores and the `mock` provider take no real money, so they show nothing;
 * - an unconfigured or unreadable store shows nothing.
 *
 * Returns `null` when there is nothing to show.
 */
export function resolveStorePaymentBadges(
  resolution: StorePaymentResolution | null | undefined,
): PaymentBadgeSet | null {
  if (!resolution || !resolution.ok || resolution.demo) return null

  const cardMethods = resolution.methods.filter((m) => isCardProviderMethod(m))
  const badges: PaymentBadgeSet = {
    // Card marks appear only while a card provider is live; the iyzico mark
    // only when that live provider is iyzico.
    cards: cardMethods.length > 0,
    iyzico: cardMethods.includes('iyzico'),
    bankTransfer: resolution.methods.includes('bank_transfer'),
    cashOnDelivery: resolution.methods.includes('cash_on_delivery'),
  }
  return hasAnyPaymentBadge(badges) ? badges : null
}
