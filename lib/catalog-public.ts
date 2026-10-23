import { slugify } from '@/lib/slug'
import { ASK_PRICE_LABEL, formatPriceCents, type PriceMode } from '@/lib/commerce-mode'
import { safeJsonLd } from '@/lib/product-json-ld'
import type { ProductSpec } from '@/lib/product-input'
import type { ProductImage } from '@/lib/product-images'

/**
 * Public catalog pages of a `commerce_mode = 'catalog'` site:
 *   /urunlerimiz                     all products
 *   /urunlerimiz/<kategori>          one category
 *   /urunlerimiz/<kategori>/<ürün>   one product
 * Pure helpers only (no I/O) so they are unit-testable and safe in client code.
 */

export const CATALOG_LIST_SLUG = 'urunlerimiz'
export const UNCATEGORIZED_SLUG = 'diger'
export const UNCATEGORIZED_NAME = 'Diğer'

export function catalogListPath(): string {
  return `/${CATALOG_LIST_SLUG}`
}

export function catalogCategoryPath(categorySlug: string): string {
  return `/${CATALOG_LIST_SLUG}/${categorySlug}`
}

export function catalogProductPath(categorySlug: string, productSlug: string): string {
  return `/${CATALOG_LIST_SLUG}/${categorySlug}/${productSlug}`
}

/** Canonical /urunlerimiz addresses for a site whose products are linked from outside the catalog pages. */
export type CatalogPaths = {
  list: string
  /** Product slug -> /urunlerimiz/<kategori>/<ürün>. */
  products: Record<string, string>
  /** Category display name -> /urunlerimiz/<kategori>. */
  categories: Record<string, string>
}

export function buildCatalogPaths(
  products: { slug: string; category_id: string | null }[],
  categories: Map<string, { name: string; slug: string }>,
): CatalogPaths {
  const paths: CatalogPaths = { list: catalogListPath(), products: {}, categories: {} }
  for (const product of products) {
    const category = product.category_id ? categories.get(product.category_id) : undefined
    const identity = categoryIdentity(category?.name, category?.slug)
    paths.products[product.slug] = catalogProductPath(identity.slug, product.slug)
    paths.categories[identity.name] = catalogCategoryPath(identity.slug)
  }
  return paths
}

export type CatalogItem = {
  id: string
  name: string
  slug: string
  description: string | null
  priceCents: number
  currency: string
  priceMode: PriceMode
  compareAtCents: number | null
  sku: string | null
  images: ProductImage[]
  specs: ProductSpec[]
  videoUrl: string | null
  categoryName: string
  categorySlug: string
  seoTitle: string | null
  seoDescription: string | null
  /** Former addresses of a renamed product; they answer with a permanent redirect. */
  previousSlugs?: string[]
  /** One-line note under the price on the product page (never on cards). */
  shortNote?: string
  /** Long-form description blocks written in the editor. */
  blocks?: { heading?: string; level?: 'h2' | 'h3'; body: string }[]
}

export type CatalogGroup = { name: string; slug: string; items: CatalogItem[] }

export function categoryIdentity(name: string | null | undefined, slug: string | null | undefined) {
  const cleanName = (name ?? '').trim()
  const cleanSlug = (slug ?? '').trim() || slugify(cleanName)
  if (!cleanName || !cleanSlug) return { name: UNCATEGORIZED_NAME, slug: UNCATEGORIZED_SLUG }
  return { name: cleanName, slug: cleanSlug }
}

/** Categories in first-appearance order, products without one last under "Diğer". */
export function groupByCategory(items: CatalogItem[]): CatalogGroup[] {
  const groups = new Map<string, CatalogGroup>()
  for (const item of items) {
    const group = groups.get(item.categorySlug) ?? { name: item.categoryName, slug: item.categorySlug, items: [] }
    group.items.push(item)
    groups.set(item.categorySlug, group)
  }
  const all = [...groups.values()]
  return [...all.filter((g) => g.slug !== UNCATEGORIZED_SLUG), ...all.filter((g) => g.slug === UNCATEGORIZED_SLUG)]
}

export function catalogPriceText(
  item: Pick<CatalogItem, 'priceMode' | 'priceCents' | 'currency'>,
  askLabel: string = ASK_PRICE_LABEL,
): string {
  if (item.priceMode === 'ask') return askLabel
  // "1.299 TL": no currency symbol, and a zero price is never shown as "0".
  return formatPriceCents(item.priceCents, item.currency) ?? askLabel
}

/* -------------------------------------------------------------------------- */
/* Video                                                                       */
/* -------------------------------------------------------------------------- */

export type VideoEmbed = { provider: 'youtube' | 'vimeo'; id: string; embedUrl: string; watchUrl: string }

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const VIMEO_ID = /^\d{5,12}$/

/**
 * Accepts YouTube (watch, youtu.be, embed, shorts) and Vimeo links only; any
 * other host yields null. The embed URL uses privacy-enhanced hosts and is only
 * ever loaded after the visitor clicks play.
 */
export function parseVideoUrl(raw: string | null | undefined): VideoEmbed | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.replace(/^www\.|^m\./, '')
  const parts = url.pathname.split('/').filter(Boolean)

  let youtubeId: string | undefined
  if (host === 'youtu.be') youtubeId = parts[0]
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parts[0] === 'watch') youtubeId = url.searchParams.get('v') ?? undefined
    else if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') youtubeId = parts[1]
  }
  if (youtubeId && YOUTUBE_ID.test(youtubeId)) {
    return {
      provider: 'youtube',
      id: youtubeId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`,
      watchUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
    }
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = parts.find((p) => VIMEO_ID.test(p))
    if (id) {
      return {
        provider: 'vimeo',
        id,
        embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1`,
        watchUrl: `https://vimeo.com/${id}`,
      }
    }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* WhatsApp                                                                    */
/* -------------------------------------------------------------------------- */

/** Ready message: product name, product code and the page address. */
export function buildCatalogWhatsappUrl(input: {
  number: string
  productName: string
  sku?: string | null
  productUrl: string
}): string {
  const lines = [`Merhaba, "${input.productName}" ürünü hakkında bilgi almak istiyorum.`]
  if (input.sku) lines.push(`Ürün Kodu: ${input.sku}`)
  lines.push(`Ürün: ${input.productUrl}`)
  return `https://wa.me/${input.number}?text=${encodeURIComponent(lines.join('\n'))}`
}

/* -------------------------------------------------------------------------- */
/* Structured data                                                             */
/* -------------------------------------------------------------------------- */

export function buildCatalogProductJsonLd(item: CatalogItem, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.name,
    url,
    ...(item.images.length ? { image: item.images.map((i) => i.url) } : {}),
    ...(item.description ? { description: item.description } : {}),
    ...(item.sku ? { sku: item.sku } : {}),
    // "Fiyat için sor": no price may be published.
    ...(item.priceMode === 'ask'
      ? {}
      : {
          offers: {
            '@type': 'Offer',
            url,
            price: (item.priceCents / 100).toFixed(2),
            priceCurrency: item.currency,
            availability: 'https://schema.org/InStock',
          },
        }),
  }
}

export function buildBreadcrumbJsonLd(trail: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: entry.url,
    })),
  }
}

export function jsonLdScripts(...values: unknown[]): string[] {
  return values.map((value) => safeJsonLd(value))
}
