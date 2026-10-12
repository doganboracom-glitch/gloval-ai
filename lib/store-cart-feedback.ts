export const MAX_CART_QTY = 99

export function clampCartQty(qty: number, max: number): number {
  return Math.max(1, Math.min(qty, Math.min(MAX_CART_QTY, max || MAX_CART_QTY)))
}

export type CartAddOutcome = { kind: 'added' | 'updated'; quantity: number }

/** What the buyer should be told after "add to cart", mirroring CartProvider.add. */
export function cartAddOutcome(
  items: ReadonlyArray<{ productId: string; quantity: number }>,
  productId: string,
  qty: number,
  maxStock: number,
): CartAddOutcome {
  const existing = items.find((i) => i.productId === productId)
  if (existing) {
    return { kind: 'updated', quantity: clampCartQty(existing.quantity + qty, maxStock) }
  }
  return { kind: 'added', quantity: clampCartQty(qty, maxStock) }
}

export function cartToastMessage(outcome: CartAddOutcome, lang: 'tr' | 'en' = 'tr'): string {
  if (lang === 'en') {
    return outcome.kind === 'added'
      ? 'Added to cart'
      : `Cart quantity updated · ${outcome.quantity} pcs`
  }
  return outcome.kind === 'added'
    ? 'Sepete eklendi'
    : `Sepetteki adet güncellendi · ${outcome.quantity} adet`
}

export const CART_TOAST_DURATION_MS = 4000

/** "Hemen al": only add when the product is not already in the cart. */
export function shouldAddForBuyNow(
  items: ReadonlyArray<{ productId: string }>,
  productId: string,
): boolean {
  return !items.some((i) => i.productId === productId)
}
