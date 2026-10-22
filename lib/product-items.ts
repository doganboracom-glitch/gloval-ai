import { slugify } from '@/lib/slug'
import type { Section, WebsiteSchema } from '@/lib/website-schema'
import {
  categoryIdentity,
  catalogCategoryPath,
  catalogProductPath,
  groupByCategory,
  parseVideoUrl,
  type CatalogGroup,
  type CatalogItem,
} from '@/lib/catalog-public'
import { PRODUCT_CATALOG_LIMIT, PRODUCT_IMAGES_MAX, PRODUCT_SPECS_MAX } from '@/lib/list-limits'
import { isUsableImageSrc } from '@/lib/about-media'

/**
 * Corporate product catalog
 * -------------------------
 * A corporate site keeps its products INLINE in the `products` section of the
 * schema (`inline: true`), exactly like portfolio or service items: no database
 * table, no cart. This module turns those items into the same `CatalogItem`s the
 * public /urunlerimiz views already render, so lists, categories, product pages,
 * JSON-LD and the sitemap share one definition. Pure: no I/O.
 */

type ProductsSection = Extract<Section, { type: 'products' }>
export type InlineProduct = ProductsSection['items'][number]

export function findInlineCatalogSection(site: Pick<WebsiteSchema, 'sections'>): ProductsSection | null {
  const section = site.sections.find((s): s is ProductsSection => s.type === 'products' && s.inline === true)
  return section ?? null
}

export function hasInlineCatalog(site: Pick<WebsiteSchema, 'sections'>): boolean {
  return findInlineCatalogSection(site) !== null
}

const CURRENCY_SYMBOLS: [RegExp, string][] = [
  [/₺|\btl\b|\btry\b/i, 'TRY'],
  [/\$|\busd\b/i, 'USD'],
  [/€|\beur\b/i, 'EUR'],
  [/£|\bgbp\b/i, 'GBP'],
]

export function inferPriceCurrency(text: string | undefined): string {
  const value = text ?? ''
  for (const [pattern, code] of CURRENCY_SYMBOLS) if (pattern.test(value)) return code
  return 'TRY'
}

/** "₺1.299,90", "$1,299.90", "1299 TL" -> cents. Unreadable text -> 0. */
export function parsePriceToCents(text: string | undefined): number {
  const digits = (text ?? '').replace(/[^\d.,]/g, '')
  if (!digits) return 0
  const lastComma = digits.lastIndexOf(',')
  const lastDot = digits.lastIndexOf('.')
  const decimalAt = Math.max(lastComma, lastDot)
  const fraction = decimalAt >= 0 ? digits.slice(decimalAt + 1) : ''
  // A separator followed by exactly 3 digits is a thousands separator ("1.299").
  const hasDecimal = decimalAt >= 0 && fraction.length > 0 && fraction.length <= 2
  const whole = (hasDecimal ? digits.slice(0, decimalAt) : digits).replace(/[.,]/g, '')
  const cents = Number(whole || '0') * 100 + (hasDecimal ? Number(fraction.padEnd(2, '0')) : 0)
  return Number.isFinite(cents) ? Math.round(cents) : 0
}

/** Stable slugs: keeps a valid stored slug, otherwise derives one from the name, then de-duplicates. */
export function assignProductSlugs<T extends { name: string; slug?: string }>(items: T[]): string[] {
  const taken = new Set<string>()
  return items.map((item) => {
    const stored = (item.slug ?? '').trim()
    const base = /^[a-z0-9-]{1,80}$/.test(stored) ? stored : slugify(item.name)
    let slug = base
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`
    taken.add(slug)
    return slug
  })
}

/** Returns the section with every item carrying a stored, unique slug. Same object when nothing changes. */
export function withProductSlugs(section: ProductsSection): ProductsSection {
  const slugs = assignProductSlugs(section.items)
  if (section.items.every((item, i) => item.slug === slugs[i])) return section
  return { ...section, items: section.items.map((item, i) => ({ ...item, slug: slugs[i] })) }
}

export function productImages(item: InlineProduct): { url: string; alt: string }[] {
  const own = (item.images ?? [])
    .filter((image) => isUsableImageSrc(image.src))
    .slice(0, PRODUCT_IMAGES_MAX)
    .map((image) => ({ url: image.src.trim(), alt: image.alt?.trim() || item.name }))
  if (own.length > 0) return own
  return isUsableImageSrc(item.src) ? [{ url: (item.src as string).trim(), alt: item.alt?.trim() || item.name }] : []
}

export function toCatalogItem(item: InlineProduct, slug: string): CatalogItem {
  const category = categoryIdentity(item.category, undefined)
  const priceMode = item.priceMode ?? (parsePriceToCents(item.price) > 0 ? 'show' : 'ask')
  const compare = parsePriceToCents(item.oldPrice)
  const price = parsePriceToCents(item.price)
  return {
    id: slug,
    name: item.name,
    slug,
    description: item.description?.trim() || null,
    priceCents: price,
    currency: inferPriceCurrency(item.price),
    priceMode,
    compareAtCents: compare > price ? compare : null,
    sku: item.sku?.trim() || null,
    images: productImages(item),
    specs: (item.specs ?? [])
      .filter((spec) => spec.name.trim() && spec.value.trim())
      .slice(0, PRODUCT_SPECS_MAX)
      .map((spec) => ({ name: spec.name.trim(), value: spec.value.trim() })),
    videoUrl: item.videoUrl && parseVideoUrl(item.videoUrl) ? item.videoUrl.trim() : null,
    categoryName: category.name,
    categorySlug: category.slug,
    seoTitle: item.seoTitle?.trim() || null,
    seoDescription: item.seoDescription?.trim() || null,
  }
}

export type InlineCatalog = {
  items: CatalogItem[]
  groups: CatalogGroup[]
  /** Product slug -> canonical address, for links on the home page and in menus. */
  paths: { list: string; products: Record<string, string>; categories: Record<string, string> }
}

/** Visible products of the site's inline catalog, or null when the site has none (-> 404). */
export function resolveInlineCatalog(site: Pick<WebsiteSchema, 'sections'>): InlineCatalog | null {
  const section = findInlineCatalogSection(site)
  if (!section || section.hidden) return null
  const slugs = assignProductSlugs(section.items)
  const items = section.items
    .map((item, i) => ({ item, slug: slugs[i] }))
    .filter(({ item }) => item.pageEnabled !== false && item.name.trim())
    .map(({ item, slug }) => toCatalogItem(item, slug))
  if (items.length === 0) return null
  const paths: InlineCatalog['paths'] = { list: '/urunlerimiz', products: {}, categories: {} }
  for (const item of items) {
    paths.products[item.slug] = catalogProductPath(item.categorySlug, item.slug)
    paths.categories[item.categoryName] = catalogCategoryPath(item.categorySlug)
  }
  return { items, groups: groupByCategory(items), paths }
}

/** Every public path of the catalog, for the tenant sitemap. */
export function inlineCatalogPaths(catalog: InlineCatalog): string[] {
  return [
    catalog.paths.list,
    ...catalog.groups.map((group) => catalogCategoryPath(group.slug)),
    ...catalog.items.map((item) => catalogProductPath(item.categorySlug, item.slug)),
  ]
}

export function canAddInlineProduct(count: number): boolean {
  return count < PRODUCT_CATALOG_LIMIT.max
}

export function canRemoveInlineProduct(count: number): boolean {
  return count > PRODUCT_CATALOG_LIMIT.min
}

/** Switches a showcase `products` section into the corporate catalog (idempotent). */
export function makeProductsInline(section: ProductsSection): ProductsSection {
  return withProductSlugs({ ...section, inline: true })
}
