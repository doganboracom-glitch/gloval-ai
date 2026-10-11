import { parseProductImagesInput, PRODUCT_IMAGE_LIMITS, type ProductImage } from '@/lib/product-images'

export const VAT_RATES = [0, 1, 10, 20] as const
export type VatRate = (typeof VAT_RATES)[number]
export const DEFAULT_VAT_RATE: VatRate = 20

export const PRODUCT_LIMITS = {
  specCount: 20,
  specName: 60,
  specValue: 200,
  shippingNote: 100,
  seoTitle: 70,
  seoDescription: 160,
} as const

export type ProductStatus = 'active' | 'draft' | 'archived'
export type ProductSpec = { name: string; value: string }

export type ProductInput = {
  name: string
  description?: string | null
  priceCents: number
  currency?: string
  sku?: string | null
  stock: number
  /** false = unlimited / not tracked (services, digital goods, made-to-order). */
  trackStock?: boolean
  status?: ProductStatus
  categoryId?: string | null
  /** Cover first. Plain URL strings are still accepted and read as `{ url, alt: '' }`. */
  images?: Array<string | ProductImage>
  compareAtPriceCents?: number | null
  vatRate?: VatRate
  specs?: ProductSpec[]
  shippingNote?: string | null
  seoTitle?: string | null
  seoDescription?: string | null
  /** Owner picks this product for the home-page showcase when its source is "manual". */
  showOnHome?: boolean
}

export type ProductInputErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_PRICE'
  | 'INVALID_COMPARE_PRICE'
  | 'INVALID_VAT_RATE'
  | 'INVALID_STOCK'
  | 'INVALID_STATUS'
  | 'INVALID_SPECS'
  | 'INVALID_SHIPPING_NOTE'
  | 'INVALID_SEO_TITLE'
  | 'INVALID_SEO_DESCRIPTION'
  | 'INVALID_IMAGES'
  | 'INVALID_IMAGE_URL'

const MESSAGES: Record<ProductInputErrorCode, { tr: string; en: string }> = {
  INVALID_NAME: { tr: 'Ürün adı gerekli.', en: 'Product name is required.' },
  INVALID_PRICE: { tr: 'Satış fiyatı 0’dan büyük olmalı.', en: 'Price must be greater than 0.' },
  INVALID_COMPARE_PRICE: {
    tr: 'Eski fiyat, satış fiyatından yüksek olmalı. İndirim göstermek istemiyorsan boş bırak.',
    en: 'The old price must be higher than the sale price. Leave it empty for no discount.',
  },
  INVALID_VAT_RATE: { tr: 'KDV oranı %0, %1, %10 veya %20 olmalı.', en: 'VAT rate must be 0, 1, 10 or 20 percent.' },
  INVALID_STOCK: { tr: 'Stok sıfır veya pozitif bir tam sayı olmalı.', en: 'Stock must be zero or a positive whole number.' },
  INVALID_STATUS: { tr: 'Geçersiz ürün durumu.', en: 'Invalid product status.' },
  INVALID_SPECS: {
    tr: `Özellikler: en fazla ${PRODUCT_LIMITS.specCount} satır, ad en fazla ${PRODUCT_LIMITS.specName}, değer en fazla ${PRODUCT_LIMITS.specValue} karakter; ad ve değer birlikte dolu olmalı ve HTML içermemeli.`,
    en: `Specs: up to ${PRODUCT_LIMITS.specCount} rows, name up to ${PRODUCT_LIMITS.specName} and value up to ${PRODUCT_LIMITS.specValue} characters; both fields are required and HTML is not allowed.`,
  },
  INVALID_SHIPPING_NOTE: {
    tr: `Gönderim notu en fazla ${PRODUCT_LIMITS.shippingNote} karakter olmalı ve HTML içermemeli.`,
    en: `Shipping note must be at most ${PRODUCT_LIMITS.shippingNote} characters with no HTML.`,
  },
  INVALID_SEO_TITLE: {
    tr: `SEO başlığı en fazla ${PRODUCT_LIMITS.seoTitle} karakter olmalı ve HTML içermemeli.`,
    en: `SEO title must be at most ${PRODUCT_LIMITS.seoTitle} characters with no HTML.`,
  },
  INVALID_SEO_DESCRIPTION: {
    tr: `SEO açıklaması en fazla ${PRODUCT_LIMITS.seoDescription} karakter olmalı ve HTML içermemeli.`,
    en: `SEO description must be at most ${PRODUCT_LIMITS.seoDescription} characters with no HTML.`,
  },
  INVALID_IMAGES: {
    tr: `Görseller: en fazla ${PRODUCT_IMAGE_LIMITS.maxCount} görsel; görsel açıklaması en fazla ${PRODUCT_IMAGE_LIMITS.maxAlt} karakter olmalı ve HTML içermemeli.`,
    en: `Images: up to ${PRODUCT_IMAGE_LIMITS.maxCount} images; alt text up to ${PRODUCT_IMAGE_LIMITS.maxAlt} characters with no HTML.`,
  },
  INVALID_IMAGE_URL: {
    tr: 'Görsel bu mağazaya yüklenmemiş. Görseli yeniden yükle.',
    en: 'This image was not uploaded to this store. Upload it again.',
  },
}

export function productInputErrorMessage(code: string, lang: 'tr' | 'en' = 'tr'): string | null {
  const entry = MESSAGES[code as ProductInputErrorCode]
  return entry ? entry[lang] : null
}

export function isVatRate(value: unknown): value is VatRate {
  return typeof value === 'number' && (VAT_RATES as readonly number[]).includes(value)
}

/** Plain text only: anything that looks like markup is rejected, never stripped. */
function containsHtml(value: string): boolean {
  return /[<>]/.test(value)
}

/**
 * Optional plain-text field: empty -> null, over-long or HTML -> error.
 * Never truncates silently.
 */
function optionalText(raw: unknown, max: number, code: ProductInputErrorCode): string | null {
  if (raw == null) return null
  if (typeof raw !== 'string') throw new Error(code)
  const value = raw.trim()
  if (!value) return null
  if (value.length > max || containsHtml(value)) throw new Error(code)
  return value
}

function normalizeSpecs(raw: unknown): ProductSpec[] {
  if (raw == null) return []
  if (!Array.isArray(raw)) throw new Error('INVALID_SPECS')

  const rows = raw
    .map((row) => {
      if (!row || typeof row !== 'object') throw new Error('INVALID_SPECS')
      const { name, value } = row as { name?: unknown; value?: unknown }
      if ((name != null && typeof name !== 'string') || (value != null && typeof value !== 'string')) {
        throw new Error('INVALID_SPECS')
      }
      return { name: (name ?? '').trim(), value: (value ?? '').trim() }
    })
    // Fully blank rows are just empty form rows, not data.
    .filter((row) => row.name || row.value)

  if (rows.length > PRODUCT_LIMITS.specCount) throw new Error('INVALID_SPECS')
  for (const row of rows) {
    if (!row.name || !row.value) throw new Error('INVALID_SPECS')
    if (row.name.length > PRODUCT_LIMITS.specName || row.value.length > PRODUCT_LIMITS.specValue) {
      throw new Error('INVALID_SPECS')
    }
    if (containsHtml(row.name) || containsHtml(row.value)) throw new Error('INVALID_SPECS')
  }
  return rows
}

/**
 * Server-side validation shared by create + update. Throws an Error whose
 * message is a `ProductInputErrorCode`; invalid input is rejected, never
 * silently coerced. The client may run this too, but only for early feedback.
 */
export function normalizeProductInput(input: ProductInput) {
  const name = input.name?.trim()
  if (!name) throw new Error('INVALID_NAME')

  const priceCents = Number(input.priceCents)
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) throw new Error('INVALID_PRICE')

  let compareAtPriceCents: number | null = null
  if (input.compareAtPriceCents != null) {
    const compare = Number(input.compareAtPriceCents)
    if (!Number.isSafeInteger(compare) || compare <= priceCents) throw new Error('INVALID_COMPARE_PRICE')
    compareAtPriceCents = compare
  }

  let vatRate: VatRate = DEFAULT_VAT_RATE
  if (input.vatRate != null) {
    if (!isVatRate(input.vatRate)) throw new Error('INVALID_VAT_RATE')
    vatRate = input.vatRate
  }

  const specs = normalizeSpecs(input.specs)
  const shippingNote = optionalText(input.shippingNote, PRODUCT_LIMITS.shippingNote, 'INVALID_SHIPPING_NOTE')
  const seoTitle = optionalText(input.seoTitle, PRODUCT_LIMITS.seoTitle, 'INVALID_SEO_TITLE')
  const seoDescription = optionalText(input.seoDescription, PRODUCT_LIMITS.seoDescription, 'INVALID_SEO_DESCRIPTION')

  const stock = Math.round(Number(input.stock))
  if (!Number.isFinite(stock) || stock < 0) throw new Error('INVALID_STOCK')

  const status: ProductStatus = input.status ?? 'active'
  if (!['active', 'draft', 'archived'].includes(status)) throw new Error('INVALID_STATUS')

  const images = parseProductImagesInput(input.images)

  return {
    name,
    description: input.description?.trim() || null,
    price_cents: priceCents,
    currency: (input.currency || 'TRY').slice(0, 8),
    sku: input.sku?.trim() || null,
    stock,
    track_stock: input.trackStock !== false,
    status,
    category_id: input.categoryId || null,
    images,
    compare_at_price_cents: compareAtPriceCents,
    vat_rate: vatRate,
    specs,
    shipping_note: shippingNote,
    seo_title: seoTitle,
    seo_description: seoDescription,
    show_on_home: input.showOnHome === true,
  }
}

/** Columns added by scripts/037; stripped while that migration is not applied. */
export const PANEL_COLUMNS = [
  'compare_at_price_cents',
  'vat_rate',
  'specs',
  'shipping_note',
  'seo_title',
  'seo_description',
] as const

/**
 * `track_stock` (scripts/032) and the panel columns (scripts/037) are applied
 * separately from the deploy. Until then, write without them instead of failing.
 */
export function withoutOptionalColumns<T extends { track_stock: boolean }>(fields: T) {
  const rest: Record<string, unknown> = { ...fields }
  delete rest.track_stock
  for (const column of PANEL_COLUMNS) delete rest[column]
  delete rest.show_on_home
  return rest
}
