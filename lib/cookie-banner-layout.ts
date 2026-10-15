/**
 * Layout rules of the cookie banner. Kept free of React so they can be tested.
 *
 * The banner is pinned to the bottom of the viewport. On pages whose primary
 * action sits low on the screen (sign-up, login, checkout, publish) it used to
 * land on top of that button and swallow the click. Three rules prevent that:
 *   1. while the banner is visible the page reserves space equal to its
 *      measured height (`--cookie-banner-h`, applied as body padding-bottom by
 *      `html[data-cookie-banner]` in globals.css) and the reservation is
 *      removed again as soon as the banner closes,
 *   2. full-height page shells and modal dialogs shrink by the same amount, so
 *      the reserved space does not add a scrollbar on top of the page, and
 *   3. on those pages — and on short viewports — the banner is a compact strip
 *      instead of a floating card.
 */

export const COOKIE_BANNER_HEIGHT_VAR = '--cookie-banner-h'

/** Attribute toggled on <html> only while the banner occupies screen space. */
export const COOKIE_BANNER_ATTR = 'data-cookie-banner'

/** Viewports at or below this height always get the compact strip. */
export const SHORT_VIEWPORT_MAX_HEIGHT = 700

export const SHORT_VIEWPORT_QUERY = `(max-height: ${SHORT_VIEWPORT_MAX_HEIGHT}px)`

/** Route prefixes whose primary action button must never be covered. */
const CRITICAL_ACTION_PREFIXES = [
  '/auth',
  '/forgot-password',
  '/billing',
  '/payment-result',
  '/editor',
  '/ecommerce',
  '/kayit',
  '/giris',
  '/signup',
  '/login',
  '/odeme',
  '/yayin',
  '/publish',
  '/checkout',
] as const

export function isCriticalActionPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const path = pathname.toLowerCase()
  return CRITICAL_ACTION_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  )
}

export function shouldUseCompactBanner(
  pathname: string | null | undefined,
  viewportHeight: number | null | undefined,
): boolean {
  if (isCriticalActionPath(pathname)) return true
  return (
    typeof viewportHeight === 'number' && viewportHeight <= SHORT_VIEWPORT_MAX_HEIGHT
  )
}

/** The slice of `document.documentElement` the inset logic needs. */
export type BannerInsetRoot = {
  style: {
    setProperty(name: string, value: string): void
    removeProperty(name: string): string | void
  }
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

/**
 * Reserve (height > 0) or release (null / 0) the banner's bottom space.
 * Both the CSS variable and the attribute are always changed together so the
 * padding can never outlive a closed banner.
 */
export function applyBannerInset(
  root: BannerInsetRoot,
  height: number | null | undefined,
): void {
  if (typeof height === 'number' && height > 0) {
    root.style.setProperty(COOKIE_BANNER_HEIGHT_VAR, `${Math.ceil(height)}px`)
    root.setAttribute(COOKIE_BANNER_ATTR, '')
    return
  }
  root.style.removeProperty(COOKIE_BANNER_HEIGHT_VAR)
  root.removeAttribute(COOKIE_BANNER_ATTR)
}
