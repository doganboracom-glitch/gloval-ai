import { MAX_QTY_PER_LINE } from '@/lib/store-order-rules'

export const LOW_STOCK_THRESHOLD = 5

type StockInfo = { stock: number; track_stock?: boolean | null }

/** Stock is only tracked when explicitly not switched off. */
export function isStockTracked(p: StockInfo): boolean {
  return p.track_stock !== false
}

export function isSoldOut(p: StockInfo): boolean {
  return isStockTracked(p) && p.stock <= 0
}

/** Highest quantity a buyer can put in the cart for this product. */
export function purchasableMax(p: StockInfo): number {
  if (!isStockTracked(p)) return MAX_QTY_PER_LINE
  return Math.max(0, Math.min(p.stock, MAX_QTY_PER_LINE))
}

export type StockNotice = { kind: 'sold_out' | 'low'; text: string } | null

/**
 * Storefront stock copy. Untracked products and comfortably stocked products
 * show nothing; the exact on-hand number is never advertised.
 */
export function getStockNotice(p: StockInfo): StockNotice {
  if (!isStockTracked(p)) return null
  if (p.stock <= 0) return { kind: 'sold_out', text: 'Tükendi' }
  if (p.stock <= LOW_STOCK_THRESHOLD) return { kind: 'low', text: `Son ${p.stock} adet` }
  return null
}
