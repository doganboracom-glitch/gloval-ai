import { discountPercent } from '@/lib/store-product-display'

export const SHOWCASE_LIMITS = [4, 8, 12] as const
export type ShowcaseLimit = (typeof SHOWCASE_LIMITS)[number]
export const DEFAULT_SHOWCASE_LIMIT: ShowcaseLimit = 4

export const SHOWCASE_SOURCES = ['latest', 'sale', 'manual'] as const
export type ShowcaseSource = (typeof SHOWCASE_SOURCES)[number]
export const DEFAULT_SHOWCASE_SOURCE: ShowcaseSource = 'latest'

export type ShowcaseSettings = { source: ShowcaseSource; limit: ShowcaseLimit }

export type ShowcaseCandidate = {
  price_cents: number
  compare_at_price_cents?: number | null
  show_on_home?: boolean | null
}

/** Reads the section's display settings, falling back to safe defaults for old schemas. */
export function resolveShowcaseSettings(section: { source?: unknown; limit?: unknown }): ShowcaseSettings {
  const source = SHOWCASE_SOURCES.find((s) => s === section.source) ?? DEFAULT_SHOWCASE_SOURCE
  const limit = SHOWCASE_LIMITS.find((l) => l === section.limit) ?? DEFAULT_SHOWCASE_LIMIT
  return { source, limit }
}

const COLLECTION_SLUG = /^[a-z0-9-]{1,60}$/

export type ShowcaseCollection = { slug: string; product_ids: readonly string[] }

/** The collection slug a section points at, or null when it has none (or an unusable one). */
export function resolveShowcaseCollection(section: { collection?: unknown }): string | null {
  const slug = section.collection
  return typeof slug === 'string' && COLLECTION_SLUG.test(slug) ? slug : null
}

/**
 * Picks the products a home-page showcase shows. A section bound to a
 * collection shows that collection (owner order, capped by `limit`); a
 * deleted, emptied or unknown collection falls back to the newest products so
 * the section never goes blank.
 */
export function selectShowcase<T extends ShowcaseCandidate & { id: string }>(
  products: readonly T[],
  collections: readonly ShowcaseCollection[] | undefined,
  section: { source?: unknown; limit?: unknown; collection?: unknown },
): { products: T[]; collection: string | null } {
  const settings = resolveShowcaseSettings(section)
  const slug = resolveShowcaseCollection(section)
  const match = slug ? collections?.find((c) => c.slug === slug) : undefined
  if (match) {
    const byId = new Map(products.map((p) => [p.id, p]))
    const members = match.product_ids.flatMap((id) => {
      const found = byId.get(id)
      return found ? [found] : []
    })
    if (members.length > 0) {
      return { products: members.slice(0, settings.limit), collection: match.slug }
    }
  }
  const fallbackSource = slug ? 'latest' : settings.source
  return {
    products: selectShowcaseProducts(products, { ...settings, source: fallbackSource }),
    collection: null,
  }
}

/**
 * Picks the products a home-page showcase shows. The catalog arrives already in
 * the database order (owner `sort_order`, then newest first), so "latest" keeps
 * that order and the other sources only filter it.
 */
export function selectShowcaseProducts<T extends ShowcaseCandidate>(
  products: readonly T[],
  settings: ShowcaseSettings,
): T[] {
  const filtered =
    settings.source === 'sale'
      ? products.filter((p) => discountPercent(p.price_cents, p.compare_at_price_cents) !== null)
      : settings.source === 'manual'
        ? products.filter((p) => p.show_on_home === true)
        : products
  return filtered.slice(0, settings.limit)
}
