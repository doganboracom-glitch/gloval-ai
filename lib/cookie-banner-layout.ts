/**
 * Layout rules of the cookie card. Kept free of React so they can be tested.
 *
 * Per variant (`CookieBannerVariant`, below) there is exactly ONE design, on
 * every page and at every width. The rules here describe the `platform`
 * variant; nothing about it depends on the route, the scroll position or the
 * page height; only Tailwind's responsive prefixes move it:
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

/**
 * Two variants of the same card, one logic:
 *  - `platform`: the small bottom-LEFT glass card above (gloval.ai pages);
 *  - `site`: the centered floating bubble for PUBLISHED customer sites
 *    (`*.gloval.site` and custom domains). Chosen by the layout that renders
 *    the card, never by hostname: the tenant layout
 *    (`app/site/[slug]/layout.tsx`) mounts `variant="site"`, the root layout
 *    mounts `variant="platform"` (see `components/platform-cookie-consent.tsx`).
 */
export type CookieBannerVariant = 'platform' | 'site'

/** Attribute on <html> while the SITE card is on screen (platform keeps `data-cookie-banner`). */
export const COOKIE_BANNER_SITE_ATTR = 'data-cookie-banner-site'

/*
 * The site's fixed controls (phone, WhatsApp, back-to-top, platform credit)
 * are NOT tagged with a class: published HTML must stay byte-identical, so
 * globals.css lifts them through their existing markup (`.fixed.z-[9998]` and
 * `[data-gloval-badge].fixed`) while `data-cookie-banner-site` is on <html>.
 */

/**
 * Site card: horizontally centered at the bottom, `min(920px, 100% - 32px)`
 * wide, 16px from the side edges (12px on phones), 20px from the bottom
 * (12px + safe-area on phones). Text left / buttons right on one row from
 * `sm`; on phones full width with the buttons wrapping below the text.
 * Same z-index as the platform card, so site modals / menus (z-50) cover it
 * and the floating controls (z-9998+) sit above it.
 */
export const COOKIE_BANNER_SITE_CLASS = [
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
  // from sm: centered, min(920px, 100% - 32px) wide, 20px above the bottom
  'sm:inset-x-4',
  'sm:bottom-5',
  'sm:mx-auto',
  'sm:max-w-[920px]',
  'sm:max-h-[70vh]',
].join(' ')

export function cookieBannerClass(variant: CookieBannerVariant, customize: boolean): string {
  if (variant === 'platform') return COOKIE_BANNER_CLASS
  // The preference panel expands vertically inside the card, so the one-line
  // row layout only applies to the collapsed state.
  return customize ? COOKIE_BANNER_SITE_CLASS : `${COOKIE_BANNER_SITE_CLASS} sm:flex-row sm:items-center`
}

/** Scrollable content area (title, text, preference toggles). */
export const COOKIE_BANNER_BODY_CLASS =
  'min-h-0 flex-1 overflow-y-auto overscroll-contain p-4'

/** Button area; stays visible while the body scrolls. */
export const COOKIE_BANNER_FOOTER_CLASS = 'shrink-0 flex flex-wrap items-center gap-2 px-4 pb-4'

export function cookieBannerFooterClass(variant: CookieBannerVariant, customize: boolean): string {
  if (variant === 'platform' || customize) return COOKIE_BANNER_FOOTER_CLASS
  return `${COOKIE_BANNER_FOOTER_CLASS} sm:flex-nowrap sm:pb-0 sm:pl-0`
}

/** Button sizing classes; the platform ones are untouched, the site ones stop stretching on the row. */
export function cookieBannerButtonClasses(variant: CookieBannerVariant) {
  if (variant === 'platform') {
    return {
      primary: 'min-w-[8rem] flex-1',
      outline: 'min-w-[8rem] flex-1',
      text: 'w-full',
    }
  }
  return {
    primary: 'min-w-[8rem] flex-1 sm:min-w-0 sm:flex-none sm:whitespace-nowrap',
    outline: 'min-w-[8rem] flex-1 sm:min-w-0 sm:flex-none sm:whitespace-nowrap',
    text: 'w-full sm:w-auto sm:whitespace-nowrap',
  }
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
 * Reserve (height > 0) or release (null / 0) the card's bottom space.
 * Both the CSS variable and the attribute are always changed together so the
 * padding can never outlive a closed card. The platform card sets
 * `data-cookie-banner`; the site card sets `data-cookie-banner-site` (which
 * also lifts the site's floating controls above it). A release always clears
 * both, so switching variants can never leave a stale attribute behind.
 */
export function applyBannerInset(
  root: BannerInsetRoot,
  height: number | null | undefined,
  variant: CookieBannerVariant = 'platform',
): void {
  root.removeAttribute(COOKIE_BANNER_ATTR)
  root.removeAttribute(COOKIE_BANNER_SITE_ATTR)
  if (typeof height === 'number' && height > 0) {
    root.style.setProperty(COOKIE_BANNER_HEIGHT_VAR, `${Math.ceil(height)}px`)
    root.setAttribute(variant === 'site' ? COOKIE_BANNER_SITE_ATTR : COOKIE_BANNER_ATTR, '')
    return
  }
  root.style.removeProperty(COOKIE_BANNER_HEIGHT_VAR)
}
