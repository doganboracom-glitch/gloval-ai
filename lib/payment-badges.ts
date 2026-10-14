import type { StorePaymentResolution } from '@/lib/store-payment-policy'

/**
 * Which payment marks a footer strip may show. Pure data, no I/O.
 *
 * - `iyzico` / `mastercard` / `visa`: logos required on every storefront by the
 *   iyzico partner review, shown whether or not a card provider is live
 * - `amex` / `troy`: only while iyzico is the live card provider
 * - `bankTransfer` / `cashOnDelivery`: small text chips, not logos
 */
export type PaymentBadgeSet = {
  iyzico: boolean
  mastercard: boolean
  visa: boolean
  amex: boolean
  troy: boolean
  bankTransfer: boolean
  cashOnDelivery: boolean
}

/** The gloval.ai (platform) footer always takes cards through iyzico. */
export const PLATFORM_PAYMENT_BADGES: PaymentBadgeSet = {
  iyzico: true,
  mastercard: true,
  visa: true,
  amex: true,
  troy: true,
  bankTransfer: false,
  cashOnDelivery: false,
}

/** Logos every storefront footer carries, regardless of payment configuration. */
export const STORE_BASE_PAYMENT_BADGES: PaymentBadgeSet = {
  iyzico: true,
  mastercard: true,
  visa: true,
  amex: false,
  troy: false,
  bankTransfer: false,
  cashOnDelivery: false,
}

export function hasAnyPaymentBadge(badges: PaymentBadgeSet | null | undefined): boolean {
  return Boolean(
    badges &&
      (badges.iyzico ||
        badges.mastercard ||
        badges.visa ||
        badges.amex ||
        badges.troy ||
        badges.bankTransfer ||
        badges.cashOnDelivery),
  )
}

/**
 * Derives the strip for a STORE footer. The iyzico, Mastercard and Visa logos
 * are always present. Everything else stays tied to what checkout would accept
 * (fail closed):
 *
 * - Amex and Troy appear only when `resolveStorePayment` kept the iyzico card
 *   method (integrated, tested, readable credentials);
 * - the manual chips appear only when that method is enabled;
 * - demo stores, the `mock` provider, and an unconfigured or unreadable store
 *   show the base logos and nothing else.
 */
export function resolveStorePaymentBadges(
  resolution: StorePaymentResolution | null | undefined,
): PaymentBadgeSet {
  if (!resolution || !resolution.ok || resolution.demo) return { ...STORE_BASE_PAYMENT_BADGES }

  const iyzicoLive = resolution.methods.includes('iyzico')
  return {
    ...STORE_BASE_PAYMENT_BADGES,
    amex: iyzicoLive,
    troy: iyzicoLive,
    bankTransfer: resolution.methods.includes('bank_transfer'),
    cashOnDelivery: resolution.methods.includes('cash_on_delivery'),
  }
}
