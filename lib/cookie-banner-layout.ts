/**
 * Layout rules of the cookie banner. Kept free of React so they can be tested.
 *
 * The banner is pinned to the bottom of the viewport. On pages whose primary
 * action sits low on the screen (sign-up, login, checkout, publish) it used to
 * land on top of that button and swallow the click. Two rules prevent that:
 *   1. the page reserves space equal to the banner's measured height
 *      (`--cookie-banner-h`, applied as body padding-bottom), and
 *   2. on those pages — and on short viewports — the banner is a compact strip
 *      instead of a floating card.
 */

export const COOKIE_BANNER_HEIGHT_VAR = '--cookie-banner-h'

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
