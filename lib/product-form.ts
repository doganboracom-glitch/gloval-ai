import {
  checkProductInput,
  productInputErrorMessage,
  PRODUCT_LIMITS,
  type ProductFieldError,
  type ProductInput,
  type ProductSpec,
  type ProductStatus,
} from '@/lib/product-input'
import { PRODUCT_IMAGE_LIMITS, type ProductImage } from '@/lib/product-images'
import type { ProductRow } from '@/lib/ecommerce'

/**
 * Pure model of the owner's product form. No React, no server calls: the
 * dialog renders it, tests drive it, and a future "fill with AI" feature can
 * hand it a `ProductFormFields` object through `applyProductFields`.
 */

export type ProductFormState = {
  name: string
  description: string
  price: string
  stock: string
  trackStock: boolean
  sku: string
  status: ProductStatus
  categoryId: string
  compareAtPrice: string
  vatRate: '0' | '1' | '10' | '20'
  shippingNote: string
  seoTitle: string
  seoDescription: string
  showOnHome: boolean
  specs: ProductSpec[]
  images: ProductImage[]
}

export const EMPTY_PRODUCT_FORM: ProductFormState = {
  name: '',
  description: '',
  price: '',
  stock: '0',
  trackStock: false,
  sku: '',
  status: 'active',
  categoryId: '',
  compareAtPrice: '',
  vatRate: '20',
  shippingNote: '',
  seoTitle: '',
  seoDescription: '',
  showOnHome: false,
  specs: [],
  images: [],
}

export function formFromProduct(product: ProductRow | null): ProductFormState {
  if (!product) return { ...EMPTY_PRODUCT_FORM, specs: [], images: [] }
  return {
    name: product.name,
    description: product.description ?? '',
    price: (product.price_cents / 100).toString(),
    stock: product.stock.toString(),
    trackStock: product.track_stock !== false,
    sku: product.sku ?? '',
    status: product.status,
    categoryId: product.category_id ?? '',
    compareAtPrice: product.compare_at_price_cents ? (product.compare_at_price_cents / 100).toString() : '',
    vatRate: String(product.vat_rate ?? 20) as ProductFormState['vatRate'],
    shippingNote: product.shipping_note ?? '',
    seoTitle: product.seo_title ?? '',
    seoDescription: product.seo_description ?? '',
    showOnHome: product.show_on_home === true,
    specs: Array.isArray(product.specs) ? product.specs.map((s) => ({ name: s.name, value: s.value ?? '' })) : [],
    images: product.images,
  }
}

// ---------------------------------------------------------------------------
// applyFields: the single entry point for filling the form from outside
// ---------------------------------------------------------------------------

/** Everything an outside caller (e.g. an AI assistant) may fill in. All optional. */
export type ProductFormFields = Partial<{
  name: string
  description: string
  /** Ignored when it is not one of the store's categories; `null` clears it. */
  categoryId: string | null
  /** Replaces the whole list. */
  specs: ProductSpec[]
  seoTitle: string
  seoDescription: string
  /** Index-aligned with the product's images; `null`/`undefined` leaves that image alone. */
  imageAlts: Array<string | null | undefined>
}>

export type ApplyProductFieldsOptions = { categoryIds?: readonly string[] }

/** Returns a new form with the given fields applied. Never saves anything. */
export function applyProductFields(
  form: ProductFormState,
  fields: ProductFormFields,
  options: ApplyProductFieldsOptions = {},
): ProductFormState {
  const next: ProductFormState = { ...form }

  if (typeof fields.name === 'string') next.name = fields.name
  if (typeof fields.description === 'string') next.description = fields.description

  if (fields.categoryId === null) next.categoryId = ''
  else if (typeof fields.categoryId === 'string') {
    if (!options.categoryIds || options.categoryIds.includes(fields.categoryId)) next.categoryId = fields.categoryId
  }

  if (Array.isArray(fields.specs)) {
    next.specs = fields.specs
      .slice(0, PRODUCT_LIMITS.specCount)
      .map((s) => ({ name: String(s?.name ?? ''), value: String(s?.value ?? '') }))
  }
  if (typeof fields.seoTitle === 'string') next.seoTitle = fields.seoTitle.slice(0, PRODUCT_LIMITS.seoTitle)
  if (typeof fields.seoDescription === 'string') {
    next.seoDescription = fields.seoDescription.slice(0, PRODUCT_LIMITS.seoDescription)
  }

  if (Array.isArray(fields.imageAlts)) {
    const alts = fields.imageAlts
    next.images = form.images.map((image, index) => {
      const alt = alts[index]
      return typeof alt === 'string' ? { ...image, alt: alt.slice(0, PRODUCT_IMAGE_LIMITS.maxAlt) } : image
    })
  }

  return next
}

/** Field ids whose values `applyProductFields` touched, so stale errors can be cleared. */
export function fieldsTouchedBy(fields: ProductFormFields): string[] {
  const touched: string[] = []
  if (fields.name !== undefined) touched.push('name')
  if (fields.description !== undefined) touched.push('description')
  if (fields.categoryId !== undefined) touched.push('categoryId')
  if (fields.specs !== undefined) touched.push('specs')
  if (fields.seoTitle !== undefined) touched.push('seoTitle')
  if (fields.seoDescription !== undefined) touched.push('seoDescription')
  if (fields.imageAlts !== undefined) touched.push('images')
  return touched
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export const SECTION_IDS = ['basics', 'images', 'pricing', 'stock', 'specs', 'publish'] as const
export type SectionId = (typeof SECTION_IDS)[number]

export const SECTION_TITLES: Record<SectionId, string> = {
  basics: 'Temel bilgiler',
  images: 'Görseller',
  pricing: 'Fiyat ve KDV',
  stock: 'Stok ve gönderim',
  specs: 'Ürün özellikleri',
  publish: 'Yayın ve SEO',
}

export const DEFAULT_OPEN_SECTIONS: Record<SectionId, boolean> = {
  basics: true,
  images: true,
  pricing: true,
  stock: false,
  specs: false,
  publish: false,
}

const FIELD_ORDER = [
  'name',
  'description',
  'categoryId',
  'images',
  'price',
  'compareAtPrice',
  'vatRate',
  'stock',
  'sku',
  'shippingNote',
  'specs',
  'status',
  'seoTitle',
  'seoDescription',
] as const

export function sectionOfField(field: string): SectionId {
  const root = field.split('.')[0]
  switch (root) {
    case 'name':
    case 'description':
    case 'categoryId':
      return 'basics'
    case 'images':
      return 'images'
    case 'price':
    case 'compareAtPrice':
    case 'vatRate':
      return 'pricing'
    case 'stock':
    case 'sku':
    case 'shippingNote':
      return 'stock'
    case 'specs':
      return 'specs'
    default:
      return 'publish'
  }
}

/** Position of a field in the visible form; spec rows sort by row, name before value. */
function fieldRank(field: string): number {
  const [root, index, part] = field.split('.')
  const base = FIELD_ORDER.indexOf(root as (typeof FIELD_ORDER)[number])
  const position = base === -1 ? FIELD_ORDER.length : base
  if (root === 'specs' && index !== undefined) return position + (Number(index) * 2 + (part === 'value' ? 1 : 0) + 1) / 1000
  return position
}

/** Field ids in the order a person meets them on the form. */
export function sortFieldsByForm(fields: string[]): string[] {
  return [...fields].sort((a, b) => fieldRank(a) - fieldRank(b))
}

/** DOM id of the control for a field (`specs.1.name` -> `pf-specs-1-name`). */
export function fieldDomId(field: string): string {
  return `pf-${field.replace(/\./g, '-')}`
}

export type FieldErrors = Record<string, string>

export function errorsToMessages(errors: ProductFieldError[]): FieldErrors {
  const out: FieldErrors = {}
  for (const { field, code } of errors) {
    if (!(field in out)) out[field] = productInputErrorMessage(code, 'tr') ?? 'Bu alanı kontrol edin.'
  }
  return out
}

export function errorCountBySection(errors: FieldErrors): Record<SectionId, number> {
  const counts: Record<SectionId, number> = { basics: 0, images: 0, pricing: 0, stock: 0, specs: 0, publish: 0 }
  for (const field of Object.keys(errors)) counts[sectionOfField(field)] += 1
  return counts
}

// ---------------------------------------------------------------------------
// Form -> payload
// ---------------------------------------------------------------------------

function parseMoneyCents(raw: string): number {
  const text = raw.trim().replace(',', '.')
  if (!text) return Number.NaN
  return Math.round(Number(text) * 100)
}

export function toProductInput(form: ProductFormState): ProductInput {
  const compare = form.compareAtPrice.trim()
  return {
    name: form.name,
    description: form.description,
    priceCents: parseMoneyCents(form.price),
    currency: 'TRY',
    // Untracked products keep stock 0; a tracked one needs a real number.
    stock: form.trackStock ? (form.stock.trim() === '' ? Number.NaN : Math.round(Number(form.stock))) : 0,
    trackStock: form.trackStock,
    sku: form.sku,
    status: form.status,
    categoryId: form.categoryId || null,
    compareAtPriceCents: compare ? parseMoneyCents(compare) : null,
    vatRate: Number(form.vatRate) as 0 | 1 | 10 | 20,
    shippingNote: form.shippingNote,
    seoTitle: form.seoTitle,
    seoDescription: form.seoDescription,
    showOnHome: form.showOnHome,
    specs: form.specs,
    images: form.images,
  }
}

/** Early, in-browser feedback with the very same rules the server enforces. */
export function validateProductForm(form: ProductFormState): { input: ProductInput; errors: FieldErrors } {
  const input = toProductInput(form)
  const checked = checkProductInput(input)
  return { input, errors: checked.ok ? {} : errorsToMessages(checked.errors) }
}

export function isFormDirty(initial: ProductFormState, current: ProductFormState): boolean {
  return JSON.stringify(initial) !== JSON.stringify(current)
}

// ---------------------------------------------------------------------------
// Section headers: a one-line summary and a "done" tick
// ---------------------------------------------------------------------------

export type SectionSummary = { done: boolean; text: string }

const STATUS_LABELS: Record<ProductStatus, string> = { active: 'Aktif', draft: 'Taslak', archived: 'Arşiv' }

export function formatTry(amount: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(amount)
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

export function sectionSummary(
  section: SectionId,
  form: ProductFormState,
  categories: ReadonlyArray<{ id: string; name: string }> = [],
): SectionSummary {
  switch (section) {
    case 'basics': {
      const name = form.name.trim()
      const category = categories.find((c) => c.id === form.categoryId)?.name
      return name
        ? { done: true, text: truncate(category ? `${name} · ${category}` : name, 36) }
        : { done: false, text: 'Ürün adı girilmedi' }
    }
    case 'images': {
      const n = form.images.length
      return n > 0 ? { done: true, text: `${n} görsel` } : { done: false, text: 'Görsel eklenmedi' }
    }
    case 'pricing': {
      const cents = parseMoneyCents(form.price)
      return Number.isFinite(cents) && cents > 0
        ? { done: true, text: `${formatTry(cents / 100)} · KDV %${form.vatRate}` }
        : { done: false, text: 'Fiyat girilmedi' }
    }
    case 'stock': {
      const parts = [form.trackStock ? `${Number(form.stock) || 0} adet` : 'Stok takibi yok']
      if (form.sku.trim()) parts.push(form.sku.trim())
      return { done: form.trackStock || form.sku.trim() !== '' || form.shippingNote.trim() !== '', text: parts.join(' · ') }
    }
    case 'specs': {
      const n = form.specs.filter((s) => s.name.trim() || s.value.trim()).length
      return n > 0 ? { done: true, text: `${n} özellik` } : { done: false, text: 'Özellik eklenmedi' }
    }
    case 'publish': {
      const seo = form.seoTitle.trim() || form.seoDescription.trim()
      return { done: true, text: seo ? `${STATUS_LABELS[form.status]} · SEO girildi` : STATUS_LABELS[form.status] }
    }
  }
}
