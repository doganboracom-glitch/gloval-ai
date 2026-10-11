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
