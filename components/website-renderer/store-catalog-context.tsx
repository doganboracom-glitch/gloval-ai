'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { slugify } from '@/lib/slug'
import type { StoreProduct } from '@/lib/store'
import type { CatalogPaths } from '@/lib/catalog-public'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { ShippingSettings } from '@/lib/store-shipping-rules'

/**
 * A single real catalog product, projected to just what the generated-site
 * product cards need to become clickable + purchasable.
 */
export type StoreCatalogEntry = {
  id: string
  slug: string
  priceCents: number
  currency: string
  stock: number
  trackStock?: boolean
  image: string | null
}

export type StoreCatalog = {
  /** Store (site) slug, used to build detail-page hrefs. */
  slug: string
  /** Real products keyed by their slug (== slugify(name)). */
  bySlug: Record<string, StoreCatalogEntry>
  /**
   * The live catalog in display order. When present, product sections render
   * these database products (see `selectShowcaseProducts`) instead of the
   * schema's own items. Absent on legacy/display-only catalogs.
   */
  products?: StoreProduct[]
  /** Store collections (published stores only); product sections can be bound to one by slug. */
  collections?: Array<{ slug: string; name: string; product_ids: string[] }>
  /** Display-only shipping rules for the cart drawer; createOrder recomputes the real charge. */
  shipping?: ShippingSettings
  /**
   * Set only for corporate sites with the catalog feature on: product and
   * "view all" links go to the /urunlerimiz pages instead of /store.
   */
  catalogPaths?: CatalogPaths
  /** True for the editor preview, which shows owner hints and has no cart. */
  isPreview?: boolean
}

const StoreCatalogContext = createContext<StoreCatalog | null>(null)

/**
 * Provides the real e-commerce catalog to the schema section components so a
 * generated product card can resolve to its live database product. Only the
 * PUBLISHED site page mounts this (with a non-empty catalog); the editor
 * preview and corporate sites render without it, so those cards keep their
 * original display-only behavior with zero change.
 */
export function StoreCatalogProvider({
  catalog,
  children,
}: {
  catalog: StoreCatalog
  children: ReactNode
}) {
  const value = useMemo(() => catalog, [catalog])
  return <StoreCatalogContext.Provider value={value}>{children}</StoreCatalogContext.Provider>
}

export function useStoreCatalog(): StoreCatalog | null {
  return useContext(StoreCatalogContext)
}

/**
 * Resolves a schema product (by its display name) to the matching live catalog
 * entry, or null when there is no store catalog or no match. Matching is by
 * slug so it stays stable across Turkish casing and punctuation.
 */
export function resolveCatalogEntry(
  catalog: StoreCatalog | null,
  name: string,
): StoreCatalogEntry | null {
  if (!catalog) return null
  return catalog.bySlug[slugify(name)] ?? null
}

/**
 * Builds a DISPLAY-ONLY catalog straight from the schema's product sections,
 * for the editor preview of a storefront that has no live database catalog.
 *
 * Its only job is to give each product card the SAME detail-page slug the
 * publish-time sync will assign (`slugify(name)`), so the preview's product
 * links resolve to the real `/site/<slug>/store/<slug>` route instead of the
 * model's invented `/products/...` href. Prices/stock are intentionally zero:
 * the preview mounts no cart, so add-to-cart stays disabled and these fields
 * are never used — the click opens the real published store in a new tab.
 */
export function buildPreviewCatalog(site: WebsiteSchema, slug: string): StoreCatalog {
  const bySlug: Record<string, StoreCatalogEntry> = {}
  for (const section of site.sections) {
    if (section.type !== 'products') continue
    for (const item of section.items ?? []) {
      const productSlug = slugify(item.name)
      if (!productSlug || bySlug[productSlug]) continue
      bySlug[productSlug] = {
        id: `preview-${productSlug}`,
        slug: productSlug,
        priceCents: 0,
        currency: 'TRY',
        stock: 0,
        image: item.src ?? null,
      }
    }
  }
  return { slug, bySlug }
}
