/**
 * Layout rules of the cookie card. Kept free of React so they can be tested.
 *
 * There is exactly ONE design: a small floating card ("balon"), on every page
 * and at every width. Nothing about it depends on the route, the scroll
 * position or the page height; only Tailwind's responsive prefixes move it:
 *
 *  - below `sm` (<640px): 12px from the left / right / bottom edge, full width,
 *    lifted by the iOS home-indicator inset, at most 45% of the screen tall;
 *  - from `sm` (>=640px): pinned to the bottom-LEFT corner, 20px from the
 *    edges, 400px wide, at most 70vh tall (the preference panel expands inside
 *    the card and scrolls there).
 *
 * Only on phones does the card cover a meaningful part of the page, so only
 * there the page reserves space equal to the card's measured height
 * (`--cookie-banner-h`, applied as body padding-bottom by
 * `html[data-cookie-banner]` inside a max-width media query in globals.css).
 * The reservation is removed again as soon as the card closes.
 */

export const COOKIE_BANNER_HEIGHT_VAR = '--cookie-banner-h'

/** Attribute toggled on <html> only while the card is on screen. */
export const COOKIE_BANNER_ATTR = 'data-cookie-banner'

/** Largest viewport width (px) that gets the full-width mobile card. */
export const COOKIE_BANNER_MOBILE_MAX_WIDTH = 639

/**
 * Stacking: below every modal / checkout overlay (`z-50` and above) so an open
 * dialog always covers the card, above ordinary page content.
 */
export const COOKIE_BANNER_Z_CLASS = 'z-[45]'

/**
 * The single wrapper class list. `cookie-card` (glass surface) and
 * `cookie-card-enter` (one-shot 200ms entrance, disabled for reduced motion)
 * live in globals.css.
 */
export const COOKIE_BANNER_CLASS = [
  'cookie-card',
  'cookie-card-enter',
  'fixed',
  COOKIE_BANNER_Z_CLASS,
  'flex',
  'flex-col',
  'overflow-hidden',
  'rounded-2xl',
  'border',
  'shadow-2xl',
  'shadow-black/30',
  'backdrop-blur-xl',
  // mobile: 12px gutters, lifted above the iOS home indicator
  'inset-x-3',
  'bottom-[max(0.75rem,env(safe-area-inset-bottom))]',
  'max-h-[45dvh]',
  // desktop: bottom-left corner, 20px from the edges
  'sm:inset-x-auto',
  'sm:left-5',
  'sm:bottom-5',
  'sm:w-full',
  'sm:max-w-[400px]',
  'sm:max-h-[70vh]',
].join(' ')

/** Scrollable content area (title, text, preference toggles). */
export const COOKIE_BANNER_BODY_CLASS =
  'min-h-0 flex-1 overflow-y-auto overscroll-contain p-4'

/** Button area; stays visible while the body scrolls. */
export const COOKIE_BANNER_FOOTER_CLASS = 'shrink-0 flex flex-wrap items-center gap-2 px-4 pb-4'

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
 * Reserve (height > 0) or release (null / 0) the card's bottom space.
 * Both the CSS variable and the attribute are always changed together so the
 * padding can never outlive a closed card.
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
