export const MAX_QTY_PER_LINE = 99
export const MAX_TOTAL_ITEMS = 999
const MAX_INT4 = 2_147_483_647

export type OrderProductRow = {
  id: string
  name: string
  price_cents: number
  currency: string | null
  stock: number
  status: string
  /** Absent on databases that have not run the order-integrity migration. */
  track_stock?: boolean | null
}

export type OrderLine = {
  product_id: string
  name: string
  unit_price_cents: number
  quantity: number
  line_total_cents: number
}

export type OrderRuleError =
  | 'invalid_items'
  | 'invalid_quantity'
  | 'quantity_too_high'
  | 'too_many_items'
  | 'product_unavailable'
  | 'product_not_purchasable'
  | 'mixed_currency'
  | 'insufficient_stock'
  | 'order_too_large'
  | 'zero_total'

export type BuildOrderResult =
  | {
      ok: true
      lines: OrderLine[]
      currency: string
      subtotalCents: number
      totalItems: number
    }
  | {
      ok: false
      error: OrderRuleError
      productId?: string
      productName?: string
      available?: number
    }

/**
 * Strict quantity parser: only whole numbers from 1 to MAX_QTY_PER_LINE pass.
 * Decimals, negatives, NaN, Infinity and non-numeric values are rejected —
 * never rounded into a valid-looking quantity.
 */
export function parseOrderQuantity(raw: unknown): number | null {
  let value: number
  if (typeof raw === 'number') value = raw
  else if (typeof raw === 'string' && raw.trim() !== '') value = Number(raw)
  else return null
  if (!Number.isInteger(value)) return null
  if (value < 1 || value > MAX_QTY_PER_LINE) return null
  return value
}

export function isTrackedStock(product: { track_stock?: boolean | null }): boolean {
  return product.track_stock !== false
}

/**
 * Turns the buyer's cart into priced order lines using ONLY authoritative
 * product rows. Pure so every money/quantity rule is unit-testable.
 */
export function buildOrderLines(
  items: { productId: unknown; quantity: unknown }[],
  productById: Map<string, OrderProductRow>,
): BuildOrderResult {
  const qtyByProduct = new Map<string, number>()
  for (const item of items) {
    if (typeof item?.productId !== 'string' || !item.productId) {
      return { ok: false, error: 'invalid_items' }
    }
    const qty = parseOrderQuantity(item.quantity)
    if (qty === null) return { ok: false, error: 'invalid_quantity', productId: item.productId }
    qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + qty)
  }

  const lines: OrderLine[] = []
  let currency: string | null = null
  let subtotal = 0
  let totalItems = 0

  for (const [productId, qty] of qtyByProduct) {
    const product = productById.get(productId)
    if (!product) return { ok: false, error: 'invalid_items', productId }
    if (product.status !== 'active') {
      return { ok: false, error: 'product_unavailable', productId, productName: product.name }
    }
    if (qty > MAX_QTY_PER_LINE) {
      return { ok: false, error: 'quantity_too_high', productId, productName: product.name }
    }
    if (!Number.isSafeInteger(product.price_cents) || product.price_cents <= 0) {
      return { ok: false, error: 'product_not_purchasable', productId, productName: product.name }
    }

    const productCurrency = (product.currency || 'TRY').trim().toUpperCase()
    if (currency !== null && currency !== productCurrency) {
      return { ok: false, error: 'mixed_currency', productId, productName: product.name }
    }
    currency = productCurrency

    if (isTrackedStock(product) && product.stock < qty) {
      return {
        ok: false,
        error: 'insufficient_stock',
        productId,
        productName: product.name,
        available: Math.max(0, product.stock),
      }
    }

    const lineTotal = product.price_cents * qty
    subtotal += lineTotal
    totalItems += qty
    if (!Number.isSafeInteger(subtotal) || subtotal > MAX_INT4) {
      return { ok: false, error: 'order_too_large' }
    }
    lines.push({
      product_id: product.id,
      name: product.name,
      unit_price_cents: product.price_cents,
      quantity: qty,
      line_total_cents: lineTotal,
    })
  }

  if (lines.length === 0) return { ok: false, error: 'invalid_items' }
  if (totalItems > MAX_TOTAL_ITEMS) return { ok: false, error: 'too_many_items' }
  if (subtotal <= 0) return { ok: false, error: 'zero_total' }

  return { ok: true, lines, currency: currency ?? 'TRY', subtotalCents: subtotal, totalItems }
}
