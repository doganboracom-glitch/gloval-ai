import { DEFAULT_VAT_RATE, type ProductSpec, type VatRate } from '@/lib/product-input'
import { readVatRate } from '@/lib/store-vat'

/**
 * Discount badge percent, always computed from the two prices (never typed in):
 * round((1 − price / old) × 100), at least 1. null when there is no real discount.
 */
export function discountPercent(priceCents: number, compareAtCents: number | null | undefined): number | null {
  if (compareAtCents == null || !Number.isFinite(compareAtCents)) return null
  if (!(priceCents > 0) || compareAtCents <= priceCents) return null
  return Math.max(1, Math.round((1 - priceCents / compareAtCents) * 100))
}

export type StoreProductExtras = {
  compare_at_price_cents: number | null
  vat_rate: VatRate
  specs: ProductSpec[]
  shipping_note: string | null
  seo_title: string | null
  seo_description: string | null
  /** Owner picked this product for the home-page showcase. False before SQL 038. */
  show_on_home: boolean
}

function text(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function parseSpecs(raw: unknown): ProductSpec[] {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  const specs: ProductSpec[] = []
  for (const row of value) {
    const name = text((row as { name?: unknown })?.name)
    const specValue = text((row as { value?: unknown })?.value)
    if (name && specValue) specs.push({ name, value: specValue })
  }
  return specs
}

/**
 * Reads the panel fields off a catalog row. Rows from a database (or RPC) that
 * does not have the columns yet simply yield the defaults.
 */
export function readProductExtras(row: Record<string, unknown>, priceCents: number): StoreProductExtras {
  const compare = Number(row.compare_at_price_cents)
  return {
    compare_at_price_cents:
      row.compare_at_price_cents != null && Number.isSafeInteger(compare) && compare > priceCents ? compare : null,
    vat_rate: readVatRate(row.vat_rate) ?? DEFAULT_VAT_RATE,
    specs: parseSpecs(row.specs),
    shipping_note: text(row.shipping_note),
    seo_title: text(row.seo_title),
    seo_description: text(row.seo_description),
    show_on_home: row.show_on_home === true,
  }
}
