import {
  computeShippingCents,
  describeShipping,
  formatTl,
  freeShippingProgress,
  type ShippingSettings,
} from '@/lib/store-shipping-rules'

/**
 * Display-only view of the shipping charge for the cart drawer and checkout
 * summary. It mirrors `computeShippingCents`, the same function createOrder
 * uses, so the numbers shown here match what the server charges. Pure: safe in
 * client components and unit tests.
 */

export type ShippingLang = 'tr' | 'en'

export type ShippingView = {
  shippingCents: number
  /** True when the buyer pays nothing for shipping on this cart. */
  free: boolean
  /** "Add X more for free shipping", only while the buyer is below the threshold. */
  hint: string | null
  /** 0..1 progress towards the threshold; null when there is no threshold to chase. */
  progress: number | null
}

export const SHIPPING_COPY: Record<
  ShippingLang,
  { label: string; free: string; remaining: (amount: string) => string }
> = {
  tr: {
    label: 'Kargo',
    free: 'Ücretsiz',
    remaining: (amount) => `Ücretsiz kargo için ${amount} daha ekleyin`,
  },
  en: {
    label: 'Shipping',
    free: 'Free',
    remaining: (amount) => `Add ${amount} more for free shipping`,
  },
}

export function buildShippingView(
  subtotalCents: number,
  settings: ShippingSettings,
  lang: ShippingLang = 'tr',
): ShippingView {
  const shippingCents = computeShippingCents(subtotalCents, settings)
  const progress = freeShippingProgress(subtotalCents, settings)
  const hint =
    progress.kind === 'remaining'
      ? SHIPPING_COPY[lang].remaining(formatTl(progress.remainingCents))
      : null
  const ratio =
    progress.kind === 'remaining' && settings.freeThresholdCents
      ? Math.min(1, Math.max(0, subtotalCents / settings.freeThresholdCents))
      : null
  return { shippingCents, free: shippingCents === 0, hint, progress: ratio }
}

/** Cart total shown before the buyer picks a payment method. */
export function cartTotalCents(
  subtotalCents: number,
  settings: ShippingSettings,
  codFeeCents = 0,
): number {
  return subtotalCents + computeShippingCents(subtotalCents, settings) + codFeeCents
}

/**
 * Text for a stored order's shipping row: "Ücretsiz" for 0, otherwise the
 * amount formatted by the caller. Orders written before shipping existed hold 0
 * and read as free, which is what the buyer actually paid.
 */
export function shippingRowValue(
  shippingCents: number,
  formatMoney: (cents: number) => string,
  lang: ShippingLang = 'tr',
): string {
  return shippingCents > 0 ? formatMoney(shippingCents) : SHIPPING_COPY[lang].free
}

/** One line for the product page, e.g. "Kargo ₺49,90, ₺500 ve üzeri ücretsiz · 1-3 iş günü". */
export function productShippingLine(settings: ShippingSettings): string {
  const base = describeShipping(settings)
  return settings.deliveryNote ? `${base} · ${settings.deliveryNote}` : base
}
