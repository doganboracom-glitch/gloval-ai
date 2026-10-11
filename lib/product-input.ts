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
  | 'INVALID_SPEC_NAME'
  | 'INVALID_SPEC_VALUE'
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
    tr: `Ürün özellikleri geçersiz. En fazla ${PRODUCT_LIMITS.specCount} satır ekleyebilirsiniz.`,
    en: `Specs are invalid. You can add up to ${PRODUCT_LIMITS.specCount} rows.`,
  },
  INVALID_SPEC_NAME: {
    tr: `Özellik adı gerekli (değer boş bırakılabilir). En fazla ${PRODUCT_LIMITS.specName} karakter olmalı ve HTML içermemeli.`,
    en: `The spec name is required (the value may stay empty). Up to ${PRODUCT_LIMITS.specName} characters, no HTML.`,
  },
  INVALID_SPEC_VALUE: {
    tr: `Özellik değeri en fazla ${PRODUCT_LIMITS.specValue} karakter olmalı ve HTML içermemeli.`,
    en: `The spec value must be at most ${PRODUCT_LIMITS.specValue} characters with no HTML.`,
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

/** A validation problem tied to one input field (`specs.2.name` points at a spec row). */
export type ProductFieldError = { field: string; code: ProductInputErrorCode }

/**
 * Spec rows: the name is required, the value is optional (an empty value is
 * shown as a "✓ name" tag on the storefront). Rows whose name AND value are
 * blank are dropped silently. Error fields use the index of the row as submitted.
 */
function normalizeSpecs(raw: unknown, errors: ProductFieldError[]): ProductSpec[] {
  if (raw == null) return []
  if (!Array.isArray(raw)) {
    errors.push({ field: 'specs', code: 'INVALID_SPECS' })
    return []
  }

  const rows: ProductSpec[] = []
  raw.forEach((row, index) => {
    if (!row || typeof row !== 'object') {
      errors.push({ field: 'specs', code: 'INVALID_SPECS' })
      return
    }
    const { name, value } = row as { name?: unknown; value?: unknown }
    if (name != null && typeof name !== 'string') {
      errors.push({ field: `specs.${index}.name`, code: 'INVALID_SPEC_NAME' })
      return
    }
    if (value != null && typeof value !== 'string') {
      errors.push({ field: `specs.${index}.value`, code: 'INVALID_SPEC_VALUE' })
      return
    }
    const cleanName = (name ?? '').trim()
    const cleanValue = (value ?? '').trim()
    if (!cleanName && !cleanValue) return

    if (!cleanName || cleanName.length > PRODUCT_LIMITS.specName || containsHtml(cleanName)) {
      errors.push({ field: `specs.${index}.name`, code: 'INVALID_SPEC_NAME' })
    }
    if (cleanValue.length > PRODUCT_LIMITS.specValue || containsHtml(cleanValue)) {
      errors.push({ field: `specs.${index}.value`, code: 'INVALID_SPEC_VALUE' })
    }
    rows.push({ name: cleanName, value: cleanValue })
  })

  if (rows.length > PRODUCT_LIMITS.specCount) errors.push({ field: 'specs', code: 'INVALID_SPECS' })
  return rows
}

function checkOptionalText(
  raw: unknown,
  max: number,
  field: string,
  code: ProductInputErrorCode,
  errors: ProductFieldError[],
): string | null {
  try {
    return optionalText(raw, max, code)
  } catch {
    errors.push({ field, code })
    return null
  }
}

/**
 * Server-side validation shared by create + update. Throws an Error whose
 * message is a `ProductInputErrorCode`; invalid input is rejected, never
 * silently coerced. The client may run this too, but only for early feedback.
 */
export function normalizeProductInput(input: ProductInput) {
  const result = checkProductInput(input)
  if (!result.ok) throw new Error(result.errors[0].code)
  return result.value
}

export type NormalizedProductInput = {
  name: string
  description: string | null
  price_cents: number
  currency: string
  sku: string | null
  stock: number
  track_stock: boolean
  status: ProductStatus
  category_id: string | null
  images: ProductImage[]
  compare_at_price_cents: number | null
  vat_rate: VatRate
  specs: ProductSpec[]
  shipping_note: string | null
  seo_title: string | null
  seo_description: string | null
  show_on_home: boolean
}

export type ProductInputCheck =
  | { ok: true; value: NormalizedProductInput }
  | { ok: false; errors: ProductFieldError[] }

/**
 * Same rules as `normalizeProductInput`, but collects EVERY problem with the
 * field it belongs to instead of stopping at the first one. Errors come in
 * form order, so `errors[0]` is what `normalizeProductInput` throws.
 */
export function checkProductInput(input: ProductInput): ProductInputCheck {
  const errors: ProductFieldError[] = []

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) errors.push({ field: 'name', code: 'INVALID_NAME' })

  const priceCents = Number(input.priceCents)
  const priceOk = Number.isSafeInteger(priceCents) && priceCents > 0
  if (!priceOk) errors.push({ field: 'price', code: 'INVALID_PRICE' })

  let compareAtPriceCents: number | null = null
  if (input.compareAtPriceCents != null) {
    const compare = Number(input.compareAtPriceCents)
    // Without a valid sale price there is nothing to compare against yet.
    if (!Number.isSafeInteger(compare) || (priceOk && compare <= priceCents)) {
      errors.push({ field: 'compareAtPrice', code: 'INVALID_COMPARE_PRICE' })
    } else {
      compareAtPriceCents = compare
    }
  }

  let vatRate: VatRate = DEFAULT_VAT_RATE
  if (input.vatRate != null) {
    if (!isVatRate(input.vatRate)) errors.push({ field: 'vatRate', code: 'INVALID_VAT_RATE' })
    else vatRate = input.vatRate
  }

  const specs = normalizeSpecs(input.specs, errors)
  const shippingNote = checkOptionalText(
    input.shippingNote,
    PRODUCT_LIMITS.shippingNote,
    'shippingNote',
    'INVALID_SHIPPING_NOTE',
    errors,
  )
  const seoTitle = checkOptionalText(input.seoTitle, PRODUCT_LIMITS.seoTitle, 'seoTitle', 'INVALID_SEO_TITLE', errors)
  const seoDescription = checkOptionalText(
    input.seoDescription,
    PRODUCT_LIMITS.seoDescription,
    'seoDescription',
    'INVALID_SEO_DESCRIPTION',
    errors,
  )

  const stock = Math.round(Number(input.stock))
  if (!Number.isFinite(stock) || stock < 0) errors.push({ field: 'stock', code: 'INVALID_STOCK' })

  const status: ProductStatus = input.status ?? 'active'
  if (!['active', 'draft', 'archived'].includes(status)) errors.push({ field: 'status', code: 'INVALID_STATUS' })

  let images: ProductImage[] = []
  try {
    images = parseProductImagesInput(input.images)
  } catch (error) {
    const code = error instanceof Error && error.message === 'INVALID_IMAGE_URL' ? 'INVALID_IMAGE_URL' : 'INVALID_IMAGES'
    errors.push({ field: 'images', code })
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
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
    },
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
