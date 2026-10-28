/**
 * Layout rules of the cookie banner. Kept free of React so they can be tested.
 *
 * There is exactly ONE banner design: a full-width bar pinned to the bottom of
 * the viewport, on every page and at every width. Nothing about it depends on
 * the route, the viewport size, the scroll position or the page height; only
 * Tailwind's responsive prefixes re-flow the contents (stacked below `sm`,
 * text on the left and buttons on the right from `sm` up).
 *
 * While the banner is visible the page reserves space equal to its measured
 * height (`--cookie-banner-h`, applied as body padding-bottom by
 * `html[data-cookie-banner]` in globals.css) so the last controls (sign-up /
 * login links, pay / publish buttons) can always be scrolled above it. The
 * reservation is removed again as soon as the banner closes.
 */

export const COOKIE_BANNER_HEIGHT_VAR = '--cookie-banner-h'

/** Attribute toggled on <html> only while the banner occupies screen space. */
export const COOKIE_BANNER_ATTR = 'data-cookie-banner'

/**
 * Stacking: below every modal / checkout overlay (`z-50` and above) so an open
 * dialog always covers the banner, above ordinary page content.
 */
export const COOKIE_BANNER_Z_CLASS = 'z-[45]'

/**
 * The single wrapper class list. Fixed to the bottom edge, full width, never
 * taller than 40% of the screen (scrolls internally if the preference panel is
 * open on a very small screen) and padded for the iOS home-indicator.
 */
export const COOKIE_BANNER_CLASS = [
  'cookie-surface',
  'fixed',
  'inset-x-0',
  'bottom-0',
  COOKIE_BANNER_Z_CLASS,
  'max-h-[40dvh]',
  'overflow-y-auto',
  'overscroll-contain',
  'border-t',
  'shadow-lg',
  'shadow-black/20',
  'pb-[env(safe-area-inset-bottom)]',
].join(' ')

/** Inner container: stacked on mobile, text left / buttons right from `sm`. */
export const COOKIE_BANNER_INNER_CLASS =
  'mx-auto max-w-6xl px-4 py-3 sm:flex sm:items-center sm:gap-6 sm:py-4'

/** Inner container while the preference toggles are expanded (always stacked). */
export const COOKIE_BANNER_INNER_EXPANDED_CLASS = 'mx-auto max-w-6xl px-4 py-3 sm:py-4'

/** Button row: wraps on narrow screens, right-aligned from `sm`. */
export const COOKIE_BANNER_ACTIONS_CLASS =
  'mt-3 flex flex-wrap gap-2 sm:mt-0 sm:shrink-0 sm:flex-nowrap sm:justify-end'

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
