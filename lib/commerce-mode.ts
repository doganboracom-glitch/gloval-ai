import { PRODUCT_LIMITS } from '@/lib/pricing-config'

/**
 * What a site's storefront is. Single source of truth for every
 * `project_type === 'ecommerce'` style check: callers ask `getCommerceMode`
 * instead of reading the column themselves.
 */
export type CommerceMode = 'ecommerce' | 'catalog' | 'none'

/** Starter/Free tried to use the catalog (or lost the PRO plan under a catalog site). */
export const CATALOG_NOT_AVAILABLE = 'CATALOG_NOT_AVAILABLE'
/** A cart/order/checkout/customer action hit a site that is not a full store. */
export const COMMERCE_NOT_AVAILABLE = 'COMMERCE_NOT_AVAILABLE'

/** Catalog product cap, ACCOUNT-WIDE (every site of the owner counts together). */
/** Public copy (pricing, plan comparison) advertises the catalog only while this is true. */
export const CATALOG_MODE_LIVE = true

export const CATALOG_PRODUCT_LIMIT: number = PRODUCT_LIMITS.pro ?? 50

export type PriceMode = 'show' | 'ask'

export function toPriceMode(value: unknown): PriceMode {
  return value === 'ask' ? 'ask' : 'show'
}

function toStoredMode(value: unknown): CommerceMode | null {
  return value === 'ecommerce' || value === 'catalog' || value === 'none' ? value : null
}

/** The catalog is a PRO feature; the e-commerce plan is the tier above it. */
export function planAllowsCatalog(planCode: string | null | undefined): boolean {
  return planCode === 'pro' || planCode === 'ecommerce'
}

/**
 * The effective commerce mode of a project.
 *
 * - Uses the stored `commerce_mode`; when that column is absent (migration 063
 *   not applied) or empty it derives from `project_type`, which keeps every
 *   pre-existing site behaving exactly as before.
 * - A `catalog` site whose owner is not on a catalog-capable plan degrades to
 *   `none`. Pass `plan` (the OWNER's plan code, `null` = no plan) to apply that
 *   rule; leave it `undefined` to read the stored mode as is.
 */
export function getCommerceMode(
  project: { commerce_mode?: string | null; project_type?: string | null },
  plan?: string | null,
): CommerceMode {
  const stored =
    toStoredMode(project.commerce_mode) ?? (project.project_type === 'ecommerce' ? 'ecommerce' : 'none')
  if (stored === 'catalog' && plan !== undefined && !planAllowsCatalog(plan)) return 'none'
  return stored
}

/* -------------------------------------------------------------------------- */
/* What each mode exposes                                                      */
/* -------------------------------------------------------------------------- */

/** `/store` and `/store/<slug>` exist for stores and catalogs, never for `none`. */
export function modeHasStoreRoutes(mode: CommerceMode): boolean {
  return mode !== 'none'
}

/** Cart, checkout, customer accounts and order pages exist only on a full store. */
export function modeHasTransactions(mode: CommerceMode): boolean {
  return mode === 'ecommerce'
}

/** The WhatsApp order button replaces "add to cart" on a catalog. */
export function modeUsesWhatsappOrder(mode: CommerceMode): boolean {
  return mode === 'catalog'
}

/** Seller panel areas per mode: a catalog only manages products. */
export type PanelArea = 'products' | 'collections' | 'orders' | 'customers' | 'payments' | 'shipping'

export function panelAreasFor(mode: CommerceMode): PanelArea[] {
  if (mode === 'ecommerce') return ['products', 'collections', 'orders', 'customers', 'payments', 'shipping']
  if (mode === 'catalog') return ['products', 'collections']
  return []
}

/** Storefront routes that are transactional and never indexed. */
export const NON_INDEXABLE_STORE_PATHS = ['/checkout', '/hesap', '/order/'] as const

export type StoreSeoPlan = {
  /** `/store` list page and every `/store/<product-slug>` page go in the sitemap. */
  indexStore: boolean
  disallow: string[]
}

export function storeSeoPlan(mode: CommerceMode): StoreSeoPlan {
  return { indexStore: modeHasStoreRoutes(mode), disallow: [...NON_INDEXABLE_STORE_PATHS] }
}

/* -------------------------------------------------------------------------- */
/* WhatsApp ordering                                                          */
/* -------------------------------------------------------------------------- */

/** Digits only, Turkish local numbers (`0532…`, `532…`) become `90532…`. Null when unusable. */
export function toWhatsappDigits(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `90${digits.slice(1)}`
  else if (digits.length === 10 && digits.startsWith('5')) digits = `90${digits}`
  return digits.length >= 10 && digits.length <= 15 ? digits : null
}

/** Digits of the demo/placeholder numbers that must never receive a real order. */
const PLACEHOLDER_NUMBER = /^(?:\+?90)?0*8500000000$|(\d)\1{6,}|1234567|0000000/

/** True for the shared demo number, repeated-digit and sequential fillers. */
export function isPlaceholderNumber(raw: string | null | undefined): boolean {
  if (!raw) return false
  const digits = raw.replace(/\D/g, '')
  if (!digits) return false
  return PLACEHOLDER_NUMBER.test(digits)
}

/** A usable, real WhatsApp number or null. Never returns a placeholder. */
export function usableWhatsappNumber(raw: string | null | undefined): string | null {
  if (!raw || isPlaceholderNumber(raw)) return null
  return toWhatsappDigits(raw)
}

export function formatCatalogPrice(priceCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY' }).format(
      priceCents / 100,
    )
  } catch {
    return `${(priceCents / 100).toFixed(2)} ${currency}`
  }
}

/** The label that replaces a price. */
export const ASK_PRICE_LABEL = 'Fiyat için sor'
export const WHATSAPP_ORDER_LABEL = 'WhatsApp ile sipariş ver'

/** `wa.me` link with a ready message: product name, product link and price. */
export function buildWhatsappOrderUrl(input: {
  number: string
  productName: string
  productUrl: string
  priceMode: PriceMode
  priceCents: number
  currency: string
}): string {
  const price =
    input.priceMode === 'ask' ? ASK_PRICE_LABEL : formatCatalogPrice(input.priceCents, input.currency)
  const text = [
    `Merhaba, "${input.productName}" ürünü hakkında sipariş vermek istiyorum.`,
    `Fiyat: ${price}`,
    `Ürün: ${input.productUrl}`,
  ].join('\n')
  return `https://wa.me/${input.number}?text=${encodeURIComponent(text)}`
}
