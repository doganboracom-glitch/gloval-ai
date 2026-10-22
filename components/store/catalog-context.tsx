'use client'

import { createContext, useContext, type ReactNode } from 'react'
import {
  ASK_PRICE_LABEL,
  buildWhatsappOrderUrl,
  formatCatalogPrice,
  modeUsesWhatsappOrder,
  toPriceMode,
  type CommerceMode,
} from '@/lib/commerce-mode'
import type { StoreProduct } from '@/lib/store'

export type CatalogContextValue = {
  mode: CommerceMode
  whatsappNumber: string | null
  origin: string
  slug: string
}

const CatalogContext = createContext<CatalogContextValue | null>(null)

export function CatalogProvider({ value, children }: { value: CatalogContextValue; children: ReactNode }) {
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

/** Null outside a storefront shell (editor preview, marketing) so callers keep e-commerce behavior. */
export function useCatalog(): CatalogContextValue | null {
  return useContext(CatalogContext)
}

/** Catalog mode: no cart, no checkout. */
export function useIsCatalog(): boolean {
  return useCatalog()?.mode === 'catalog'
}

/** Price text honoring price_mode; null means "render the normal formatted price". */
export function catalogPriceLabel(product: StoreProduct): string | null {
  return product.price_mode === 'ask' ? ASK_PRICE_LABEL : null
}

export function catalogDisplayPrice(product: StoreProduct): string {
  return catalogPriceLabel(product) ?? formatCatalogPrice(product.price_cents, product.currency)
}

/** Ready WhatsApp order link, or null when the mode/number does not allow the button. */
export function whatsappOrderHref(
  catalog: CatalogContextValue | null,
  product: StoreProduct,
  canonicalPath?: string,
): string | null {
  if (!catalog || !modeUsesWhatsappOrder(catalog.mode) || !catalog.whatsappNumber) return null
  return buildWhatsappOrderUrl({
    number: catalog.whatsappNumber,
    productName: product.name,
    productUrl: `${catalog.origin}${canonicalPath ?? `/store/${product.slug}`}`,
    priceMode: toPriceMode(product.price_mode),
    priceCents: product.price_cents,
    currency: product.currency,
  })
}
