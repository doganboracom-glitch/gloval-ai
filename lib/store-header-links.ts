export const storeHomeHref = (slug: string) => `/site/${slug}`
export const storeListHref = (slug: string) => `/site/${slug}/store`
/** Checkout is only reached from the cart drawer's "Ödemeye geç" and the product page's "Hemen al". */
export const storeCheckoutHref = (slug: string) => `/site/${slug}/checkout`

export const storeAccountHref = (slug: string) => `/site/${slug}/hesap`
export const storeSessionApiHref = (slug: string) =>
  `/api/store/session?slug=${encodeURIComponent(slug)}`

/** Anything that is not an explicit `{ loggedIn: true }` counts as signed out. */
export function normalizeSessionPayload(data: unknown): { loggedIn: boolean } {
  const loggedIn =
    typeof data === 'object' && data !== null && (data as { loggedIn?: unknown }).loggedIn === true
  return { loggedIn }
}

export const ACCOUNT_LABELS = {
  tr: { signIn: 'Giriş yap', account: 'Hesabım' },
  en: { signIn: 'Sign in', account: 'My account' },
} as const

/** Only storefront pages (which carry a store slug) get the customer-account link. */
export function shouldShowAccountLink(storeSlug?: string | null): storeSlug is string {
  return typeof storeSlug === 'string' && storeSlug.length > 0
}

export function accountLinkLabel(loggedIn: boolean, lang: 'tr' | 'en' = 'tr'): string {
  const labels = ACCOUNT_LABELS[lang] ?? ACCOUNT_LABELS.tr
  return loggedIn ? labels.account : labels.signIn
}

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
