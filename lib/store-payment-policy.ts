import type { PaymentProviderId } from '@/lib/payments/types'
import { PAYMENT_METHODS } from '@/lib/payments/methods'

/**
 * Pure policy for STORE (tenant e-commerce) payments. Deliberately free of
 * I/O and of `'use server'` so it can be unit-tested and imported anywhere.
 *
 * The rule: a store only ever takes payment through a provider its owner
 * explicitly configured. Anything else (no row, disabled, empty list, or a
 * database error while reading the row) FAILS CLOSED — it never degrades to
 * the `mock` provider, which settles instantly as "paid".
 *
 * This is separate from the platform-billing guard in `lib/payments/index.ts`
 * (`getPlatformPaymentProviderId`), which only covers Gloval's own billing.
 */

/** Real providers a store owner can select; sourced from the owner UI metadata. */
const OWNER_SELECTABLE = new Set<string>(PAYMENT_METHODS.map((m) => m.id))

/** Providers with no PSP round trip: the order stays pending until the owner confirms. */
export function isManualStoreProvider(id: PaymentProviderId): boolean {
  return id === 'bank_transfer'
}

/**
 * Mock store payments are allowed ONLY outside production AND with the
 * explicit opt-in flag. `VERCEL_ENV === 'production'` always wins.
 */
export function isMockStorePaymentsAllowed(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.VERCEL_ENV === 'production') return false
  return env.ALLOW_MOCK_STORE_PAYMENTS === 'true'
}

export type StorePaymentRow = {
  provider?: string | null
  enabled?: boolean | null
  enabled_providers?: unknown
  public_config?: unknown
}

export type StorePaymentUnavailableReason = 'not_configured' | 'config_unreadable'

export type StorePaymentResolution =
  | {
      ok: true
      /** Methods a buyer may choose from, in the owner's order. */
      methods: PaymentProviderId[]
      /** Used when the buyer's pick is missing or not permitted. */
      defaultProvider: PaymentProviderId
      publicConfig: Record<string, unknown>
    }
  | { ok: false; reason: StorePaymentUnavailableReason }

/**
 * Decides which methods a store can accept right now.
 *
 * @param row   the `ecommerce_payment_settings` row, or null when none exists
 * @param readFailed true when the query itself errored (NOT "no row")
 */
export function resolveStorePayment(
  row: StorePaymentRow | null,
  readFailed: boolean,
  mockAllowed: boolean = isMockStorePaymentsAllowed(),
): StorePaymentResolution {
  // A database error says nothing about the owner's configuration. Never read
  // it as "no settings" — fail closed, regardless of the mock flag.
  if (readFailed) return { ok: false, reason: 'config_unreadable' }

  const usable = (id: unknown): id is PaymentProviderId => {
    if (typeof id !== 'string') return false
    if (id === 'mock') return mockAllowed
    return OWNER_SELECTABLE.has(id)
  }

  if (row && row.enabled) {
    const listed = Array.isArray(row.enabled_providers) ? row.enabled_providers : []
    const candidates = listed.length > 0 ? listed : [row.provider]
    const methods = Array.from(new Set(candidates.filter(usable)))
    if (methods.length > 0) {
      const primary = usable(row.provider) && methods.includes(row.provider) ? row.provider : methods[0]
      const publicConfig =
        row.public_config && typeof row.public_config === 'object'
          ? (row.public_config as Record<string, unknown>)
          : {}
      return { ok: true, methods, defaultProvider: primary, publicConfig }
    }
  }

  // No usable owner configuration. The ONLY remaining option is the explicit
  // non-production mock opt-in.
  if (mockAllowed) {
    return { ok: true, methods: ['mock'], defaultProvider: 'mock', publicConfig: {} }
  }
  return { ok: false, reason: 'not_configured' }
}

/** Buyer-facing copy for a store that cannot take orders. */
export const STORE_PAYMENT_UNAVAILABLE_MESSAGE: {
  not_configured: { tr: string; en: string }
  config_unreadable: { tr: string; en: string }
} = {
  not_configured: {
    tr: 'Bu mağaza şu an sipariş alamıyor, ödeme yöntemi tanımlanmamış.',
    en: 'This store cannot take orders right now: no payment method has been set up.',
  },
  config_unreadable: {
    tr: 'Ödeme bilgileri şu an alınamadı. Lütfen biraz sonra tekrar deneyin.',
    en: 'Payment details could not be loaded right now. Please try again shortly.',
  },
}

/** Error codes returned by `createOrder` when payments are unavailable. */
export const STORE_PAYMENT_ERROR_CODE: Record<StorePaymentUnavailableReason, string> = {
  not_configured: 'payment_not_configured',
  config_unreadable: 'payment_config_unreadable',
}
