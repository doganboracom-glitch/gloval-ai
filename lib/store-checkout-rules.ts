import type { PaymentProviderId } from '@/lib/payments/types'
import type { CardProviderId } from '@/lib/payments/card-providers'

/**
 * Pure checkout rules shared by the server (createOrder, owner settings) and
 * the UI. No I/O, no `'use server'`, so it can be unit tested and imported
 * anywhere. The server is always authoritative: the client never supplies a
 * fee or a total.
 */

/** Upper bound for the cash-on-delivery surcharge: 1.000 TL. */
export const COD_FEE_MAX_CENTS = 100_000

export type CardProviderChoice = CardProviderId

/**
 * Parses an owner-entered fee in TL ("12", "12,5", "12.50") into integer cents.
 * Blank means 0. Returns null for anything invalid: negative, non-numeric, more
 * than two decimals or above the cap.
 */
export function parseCodFeeInput(raw: unknown): number | null {
  const text =
    typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : ''
  if (text === '') return 0
  if (!/^\d{1,5}([.,]\d{1,2})?$/.test(text)) return null
  const [whole, frac = ''] = text.replace(',', '.').split('.')
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  if (!Number.isInteger(cents) || cents < 0 || cents > COD_FEE_MAX_CENTS) return null
  return cents
}

/** Validates a stored/received cents value (integer within range). */
export function isValidCodFeeCents(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= COD_FEE_MAX_CENTS
  )
}

/** Cents to the text shown in the owner's input ("12,50", "" for 0). */
export function formatCodFeeInput(cents: number): string {
  if (!isValidCodFeeCents(cents) || cents === 0) return ''
  const whole = Math.floor(cents / 100)
  const frac = cents % 100
  return frac === 0 ? String(whole) : `${whole},${String(frac).padStart(2, '0')}`
}

export type OrderTotals = {
  subtotalCents: number
  shippingCents: number
  codFeeCents: number
  totalCents: number
}

/**
 * Authoritative order totals: subtotal + shipping + cash-on-delivery fee. The
 * fee applies ONLY when the chosen provider is `cash_on_delivery`; card and
 * bank-transfer orders always get 0. A fee outside the allowed range is treated
 * as 0 rather than trusted.
 */
export function computeOrderTotals(input: {
  subtotalCents: number
  shippingCents: number
  providerId: PaymentProviderId | string
  codFeeCents: number
}): OrderTotals {
  const codFeeCents =
    input.providerId === 'cash_on_delivery' && isValidCodFeeCents(input.codFeeCents)
      ? input.codFeeCents
      : 0
  return {
    subtotalCents: input.subtotalCents,
    shippingCents: input.shippingCents,
    codFeeCents,
    totalCents: input.subtotalCents + input.shippingCents + codFeeCents,
  }
}

/**
 * The fee to display for a stored order. Uses `cod_fee_cents` when present;
 * on databases without that column the fee is derived from the remainder
 * (cash on delivery only), so the line still shows up.
 */
export function orderCodFeeCents(order: {
  payment_provider?: string | null
  cod_fee_cents?: number | null
  subtotal_cents: number
  shipping_cents: number
  total_cents: number
}): number {
  if (order.payment_provider !== 'cash_on_delivery') return 0
  if (typeof order.cod_fee_cents === 'number') return Math.max(0, order.cod_fee_cents)
  return Math.max(0, order.total_cents - order.subtotal_cents - order.shipping_cents)
}

/**
 * Guest-checkout rule, enforced server side in createOrder. With guest
 * checkout off, an order needs a logged-in store customer for this store.
 */
export function isCheckoutAllowed(guestCheckout: boolean, customerId: string | null): boolean {
  return guestCheckout || Boolean(customerId)
}

export type PaymentModuleState = {
  id: 'card' | 'bank_transfer' | 'cash_on_delivery'
  enabled: boolean
  /** Enabled AND actually able to take an order right now. */
  ready: boolean
  /** Why an enabled module is not ready. */
  problem?:
    | 'card_coming_soon'
    | 'card_not_tested'
    | 'card_unreadable'
    | 'card_infrastructure'
    | 'iban_missing'
}

export type PaymentSummary = {
  modules: PaymentModuleState[]
  activeCardProvider: CardProviderChoice
  guestCheckout: boolean
  codFeeCents: number
  /** True when at least one module can take an order. */
  ordersOpen: boolean
  /** Why orders are closed, when they are. */
  closedReason: 'none_enabled' | 'none_ready' | null
}

export function buildPaymentSummary(input: {
  cardEnabled: boolean
  /** The active card provider has a per-store integration at all. */
  cardIntegrated: boolean
  cardReady: boolean
  cardUnreadable: boolean
  /** Tested connection, but the platform database cannot hold card orders. */
  cardInfrastructure?: boolean
  bankEnabled: boolean
  bankIbanValid: boolean
  codEnabled: boolean
  activeCardProvider: CardProviderChoice
  guestCheckout: boolean
  codFeeCents: number
}): PaymentSummary {
  const modules: PaymentModuleState[] = [
    {
      id: 'card',
      enabled: input.cardEnabled,
      ready: input.cardEnabled && input.cardIntegrated && input.cardReady,
      problem:
        input.cardEnabled && !input.cardIntegrated
          ? 'card_coming_soon'
          : input.cardEnabled && !input.cardReady
            ? input.cardUnreadable
              ? 'card_unreadable'
              : input.cardInfrastructure
                ? 'card_infrastructure'
                : 'card_not_tested'
            : undefined,
    },
    {
      id: 'bank_transfer',
      enabled: input.bankEnabled,
      ready: input.bankEnabled && input.bankIbanValid,
      problem: input.bankEnabled && !input.bankIbanValid ? 'iban_missing' : undefined,
    },
    { id: 'cash_on_delivery', enabled: input.codEnabled, ready: input.codEnabled },
  ]
  const anyEnabled = modules.some((m) => m.enabled)
  const ordersOpen = modules.some((m) => m.ready)
  return {
    modules,
    activeCardProvider: input.activeCardProvider,
    guestCheckout: input.guestCheckout,
    codFeeCents: input.codFeeCents,
    ordersOpen,
    closedReason: ordersOpen ? null : anyEnabled ? 'none_ready' : 'none_enabled',
  }
}
