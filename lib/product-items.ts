import { slugify } from '@/lib/slug'
import { formatPriceCents } from '@/lib/commerce-mode'

export { formatPriceCents }
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
import {
  PRODUCT_CATALOG_LIMIT,
  PRODUCT_HOME_DEFAULT_LIMIT,
  PRODUCT_IMAGES_MAX,
  PRODUCT_SPECS_MAX,
} from '@/lib/list-limits'
import { isUsableImageSrc } from '@/lib/about-media'
import { orderCatalogGroups } from '@/lib/product-categories'

/**
 * Corporate product catalog
 * -------------------------
 * A corporate site keeps its products INLINE in the `products` section of the
 * schema (`inline: true`), exactly like portfolio or service items: no database
 * table, no cart. This module turns those items into the same `CatalogItem`s the
 * public /urunlerimiz views already render, so lists, categories, product pages,
 * JSON-LD and the sitemap share one definition. Pure: no I/O.
 *
 * Plan gate decision: inline product pages are site CONTENT (like service and
 * portfolio detail pages), so they are available on every plan and
 * `resolveInlineCatalog` takes no plan input. Only the database-backed catalog
 * (`commerce_mode = 'catalog'`, see `lib/catalog-feature.ts`) stays PRO-only.
 */

type ProductsSection = Extract<Section, { type: 'products' }>
export type InlineProduct = ProductsSection['items'][number]

export function findInlineCatalogSection(site: Pick<WebsiteSchema, 'sections'>): ProductsSection | null {
  const section = site.sections?.find((s): s is ProductsSection => s.type === 'products' && s.inline === true)
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

export function formatProductPrice(text: string | undefined): string | null {
  return formatPriceCents(parsePriceToCents(text), inferPriceCurrency(text))
}

const PLACEHOLDER_NAMES = new Set(['yeni urun', 'new product'])

/**
 * An untouched row: no name, or still the "Yeni ürün" default with no photo, price or description.
 * Such rows are editor scaffolding: never published, never given an address, listed in the publish warning.
 */
type PlaceholderCandidate = {
  name: string
  price?: string
  src?: string
  images?: { src: string }[]
  description?: string
}

export function isPlaceholderProduct(item: PlaceholderCandidate): boolean {
  const name = item.name.trim()
  if (!name) return true
  const folded = name.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i')
  if (!PLACEHOLDER_NAMES.has(folded)) return false
  const hasImage = isUsableImageSrc(item.src) || (item.images ?? []).some((image) => isUsableImageSrc(image.src))
  return !hasImage && parsePriceToCents(item.price) <= 0 && !item.description?.trim()
}

export function isRealProduct(item: PlaceholderCandidate): boolean {
  return !isPlaceholderProduct(item)
}

/** How many placeholder rows the published catalog would silently skip. */
export function countPlaceholderProducts(site: Pick<WebsiteSchema, 'sections'>): number {
  const section = findInlineCatalogSection(site)
  return section ? section.items.filter(isPlaceholderProduct).length : 0
}

/**
 * Corner badge for a product card: the owner's own badge wins; otherwise a
 * struck old price that is really higher than the current price earns "İndirimli".
 */
export function saleBadge(
  item: { badge?: string; price?: string; oldPrice?: string },
  lang: string | undefined,
): string | undefined {
  const own = item.badge?.trim()
  if (own) return own
  const now = parsePriceToCents(item.price)
  const was = parsePriceToCents(item.oldPrice)
  if (now <= 0 || was <= now) return undefined
  return lang === 'en' ? 'Sale' : 'İndirimli'
}

/** Words the catalog routes already use as path segments; a product can never take one as its address. */
const RESERVED_PRODUCT_SLUGS = new Set(['urunlerimiz', 'kategori', 'category', 'products', 'new', 'sitemap', 'api'])

/** Stable slugs: keeps a valid stored slug, otherwise derives one from the name, then de-duplicates. */
export function assignProductSlugs<T extends { name: string; slug?: string }>(items: T[]): string[] {
  const taken = new Set<string>()
  return items.map((item) => {
    const stored = (item.slug ?? '').trim()
    // A stored slug that is malformed or collides with a catalog route ("urunlerimiz") is re-derived from the name.
    const storedOk = /^[a-z0-9-]{1,80}$/.test(stored) && !RESERVED_PRODUCT_SLUGS.has(stored)
    let base = storedOk ? stored : slugify(item.name)
    if (!base || RESERVED_PRODUCT_SLUGS.has(base)) base = `${base || 'urun'}-urun`.replace(/^urun-urun$/, 'urun')
    let slug = base
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`
    taken.add(slug)
    return slug
  })
}

/**
 * Returns the section with every NAMED item carrying a stored, unique slug. Same object when nothing changes.
 * A draft with no name keeps no slug, so the address is taken from the name the owner finally types and then
 * stays put: renaming a product later never breaks a link that was already shared or indexed.
 */
export function withProductSlugs(section: ProductsSection): ProductsSection {
  const slugs = assignProductSlugs(section.items)
  const needs = (item: InlineProduct, i: number) => isRealProduct(item) && item.slug !== slugs[i]
  if (!section.items.some(needs)) return section
  return {
    ...section,
    items: section.items.map((item, i) => (needs(item, i) ? { ...item, slug: slugs[i] } : item)),
  }
}

const PREVIOUS_SLUGS_MAX = 10

/**
 * Renames a product. Its address follows the new name and the old address is remembered, so a link that was
 * already shared or indexed answers with a permanent redirect instead of a 404.
 */
export function withRenamedProduct(section: ProductsSection, itemIndex: number, name: string): ProductsSection {
  const item = section.items[itemIndex]
  if (!item) return section
  const renamed = { ...item, name }
  const oldSlug = item.slug?.trim()
  let next = { ...section, items: section.items.map((it, i) => (i === itemIndex ? renamed : it)) }
  if (!oldSlug || !isRealProduct(renamed)) return section.inline ? withProductSlugs(next) : next
  const others = next.items.filter((_, i) => i !== itemIndex)
  const taken = new Set(assignProductSlugs(others))
  let base = slugify(name)
  if (!base || RESERVED_PRODUCT_SLUGS.has(base)) base = `${base || 'urun'}-urun`
  let slug = base
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`
  if (slug === oldSlug) return next
  const previous = [oldSlug, ...(renamed.previousSlugs ?? [])].filter((p) => p !== slug)
  next = {
    ...next,
    items: next.items.map((it, i) =>
      i === itemIndex ? { ...it, slug, previousSlugs: [...new Set(previous)].slice(0, PREVIOUS_SLUGS_MAX) } : it,
    ),
  }
  return next
}

/**
 * Which products the home showcase shows. Owners pick with `showOnHome`; a site saved before that flag
 * existed showed every product, so with no flag anywhere the first `limit` (or all) keep showing.
 */
export function homeProductIndexes(section: Pick<ProductsSection, 'items' | 'limit'>): number[] {
  const named = section.items.map((item, i) => ({ item, i })).filter(({ item }) => isRealProduct(item))
  const flagged = named.some(({ item }) => item.showOnHome !== undefined)
  const picked = flagged
    ? named.filter(({ item }) => item.showOnHome === true)
    : named.slice(0, section.limit ?? named.length)
  return picked.slice(0, section.limit ?? PRODUCT_HOME_DEFAULT_LIMIT_CAP).map(({ i }) => i)
}

/** Large enough never to bite a legacy site that shows every product and has no explicit count. */
const PRODUCT_HOME_DEFAULT_LIMIT_CAP = PRODUCT_CATALOG_LIMIT.max

/** True when a NEW product should start on the home page: only while there is still room. */
export function homeHasRoom(section: Pick<ProductsSection, 'items' | 'limit'>): boolean {
  return homeProductIndexes(section).length < (section.limit ?? PRODUCT_HOME_DEFAULT_LIMIT)
}

/** The products the home showcase renders, each with the address of its own product page. */
export function homeProductCards(section: ProductsSection): { item: InlineProduct; href: string }[] {
  const slugs = assignProductSlugs(section.items)
  return homeProductIndexes(section).map((i) => {
    const item = section.items[i]
    const category = categoryIdentity(item.category, undefined)
    return { item, href: catalogProductPath(category.slug, slugs[i]) }
  })
}

/** Writes the legacy "show everything" state out as explicit flags, so one product can then be switched off. */
export function withHomeFlags(section: ProductsSection): ProductsSection {
  if (section.items.every((item) => item.showOnHome !== undefined || isPlaceholderProduct(item))) return section
  const shown = new Set(homeProductIndexes(section))
  return { ...section, items: section.items.map((item, i) => ({ ...item, showOnHome: shown.has(i) })) }
}

export const PRODUCT_DESCRIPTION_MAX = 2000
export const PRODUCT_SHORT_NOTE_MAX = 80

/** One-line note shown under the price: collapsed whitespace, capped at 80 characters. */
export function cleanShortNote(raw: string | undefined | null): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, PRODUCT_SHORT_NOTE_MAX)
}

/**
 * The single "Açıklama" text of a product. Older products kept a short line (`description`) and separate
 * long blocks (`detail`); both are folded into one text, oldest data first, nothing dropped (up to the cap).
 */
export function mergedProductDescription(item: Pick<InlineProduct, 'description' | 'detail'>): string {
  const parts: string[] = []
  const short = item.description?.trim()
  if (short) parts.push(short)
  for (const block of item.detail ?? []) {
    const heading = block.heading?.trim()
    const body = block.body?.trim()
    if (heading) parts.push(heading)
    if (body) parts.push(body)
  }
  return parts.join('\n\n').slice(0, PRODUCT_DESCRIPTION_MAX)
}

/** Normalises what the owner typed: line breaks kept, trailing space trimmed, capped at 2000. */
export function cleanProductDescription(raw: string | undefined | null): string {
  return (raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, PRODUCT_DESCRIPTION_MAX)
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
    previousSlugs: item.previousSlugs ?? [],
    blocks: (item.detail ?? []).filter((block) => block.body.trim() || block.heading?.trim()),
    ...(cleanShortNote(item.shortNote) ? { shortNote: cleanShortNote(item.shortNote) } : {}),
  }
}

/** Finds a product by its current address, or by an old one it was renamed from (`moved` -> redirect). */
export function findCatalogItem<T extends { slug: string; previousSlugs?: string[] }>(
  items: T[],
  slug: string,
): { item: T; moved: boolean } | null {
  const current = items.find((i) => i.slug === slug)
  if (current) return { item: current, moved: false }
  const old = items.find((i) => i.previousSlugs?.includes(slug))
  return old ? { item: old, moved: true } : null
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
    .filter(({ item }) => isRealProduct(item))
    .map(({ item, slug }) => toCatalogItem(item, slug))
  if (items.length === 0) return null
  const paths: InlineCatalog['paths'] = { list: '/urunlerimiz', products: {}, categories: {} }
  for (const item of items) {
    paths.products[item.slug] = catalogProductPath(item.categorySlug, item.slug)
    paths.categories[item.categoryName] = catalogCategoryPath(item.categorySlug)
  }
  return { items, groups: orderCatalogGroups(groupByCategory(items), section), paths }
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
