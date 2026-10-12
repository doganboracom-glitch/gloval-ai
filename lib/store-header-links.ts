export const storeHomeHref = (slug: string) => `/site/${slug}`
export const storeListHref = (slug: string) => `/site/${slug}/store`
export const storeCartHref = (slug: string) => `/site/${slug}/checkout`

/** A header CTA that means "go to the cart" (label or target). */
export function isCartCta(cta: { label: string; href?: string | null }): boolean {
  return /sepet|cart/i.test(cta.label) || /\/(checkout|cart|sepet)\b/i.test(cta.href ?? '')
}

/** A header link/page that means "the product list". */
export function isProductsLink(label: string, href?: string | null): boolean {
  const h = (href ?? '').trim().toLowerCase()
  if (h === '#products' || h === '#urunler' || h.endsWith('/store')) return true
  return /^\s*(ürünler|urunler|tüm ürünler|products|shop|mağaza)\s*$/i.test(label)
}

export const VIEW_ALL_DEFAULT = { tr: 'Tüm ürünleri gör', en: 'View all products' } as const

/**
 * Label of the "view all products" link under a products section. Unset uses
 * the default; an explicitly empty string is the owner hiding the link.
 */
export function resolveViewAllLabel(
  configured: string | undefined,
  lang: 'tr' | 'en' = 'tr',
): string | null {
  if (configured === undefined) return VIEW_ALL_DEFAULT[lang]
  const trimmed = configured.trim()
  return trimmed ? trimmed : null
}
