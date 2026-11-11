import type { WebsiteSchema } from '@/lib/website-schema'

/**
 * Shared demo-shell constants and helpers.
 *
 * The "Demo çalışma" banner is sticky at the top of every demo page, and the real
 * site header is sticky too. The banner's height is fixed and defined ONLY here;
 * the banner renders with exactly this height and the demo root publishes it as
 * `--site-sticky-offset`, which `WebsiteHeader` uses as its sticky `top`. Outside
 * the demos the variable is unset (0px), so real sites are unaffected.
 */
export const DEMO_BANNER_HEIGHT_PX = 44

/** Inline style for the demo root that makes the site header stick BELOW the banner. */
export function demoStickyOffsetVars(showBanner: boolean): Record<string, string> {
  return showBanner ? { '--site-sticky-offset': `${DEMO_BANNER_HEIGHT_PX}px` } : {}
}

/**
 * Height of the sticky "Ücretsiz dene" strip pinned to the bottom of the sector
 * landing demos. Single source, like the banner height: the strip renders with
 * exactly this height and the demo root publishes it as `--demo-cta-h`, which
 * globals.css uses to reserve the space and to raise the site's fixed controls
 * (phone, WhatsApp, back-to-top) above the strip.
 */
export const DEMO_CTA_STRIP_HEIGHT_PX = 64

export function demoCtaStripVars(showStrip: boolean): Record<string, string> {
  return showStrip ? { '--demo-cta-h': `${DEMO_CTA_STRIP_HEIGHT_PX}px` } : {}
}

/**
 * Where the strip's button goes: the platform home page (the existing "try it"
 * flow), tagged so the first-touch attribution capture records the demo.
 * The home page is used rather than `/auth/*` because auth routes are not a
 * measurement surface, so campaign parameters are not read there.
 */
export function demoCtaHref(campaign: string, lang: string): string {
  const params = new URLSearchParams({
    utm_source: 'demo',
    utm_medium: 'landing',
    utm_campaign: campaign,
    utm_content: 'demo_cta',
  })
  if (lang === 'en') params.set('lang', 'en')
  return `/?${params.toString()}`
}

export function withLang(path: string, lang: string): string {
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}lang=${lang}`
}

/**
 * The demo home route for a slug. This is also where the sub-page logo and the
 * "Home" nav entry point, since the sub-pages are separate routes and the home
 * link (`#hero`) is only meaningful on the home page itself.
 */
export function demoHomeHref(slug: string, lang: string): string {
  return withLang(`/demo/${slug}`, lang)
}

/**
 * The SAME navigation the demo home renders (from `buildDemoSite`), adapted for
 * a sub-page: only in-page anchors (`#...`) are re-pointed at the demo home so
 * they keep working off the home page. Every other link already targets a demo
 * route, and the CTA is untouched.
 */
export function navigationForDemoSubpage(
  navigation: WebsiteSchema['navigation'],
  slug: string,
  lang: string,
): WebsiteSchema['navigation'] {
  const home = demoHomeHref(slug, lang)
  return {
    ...navigation,
    links: navigation.links.map((link) =>
      link.href.startsWith('#') ? { ...link, href: home } : link,
    ),
  }
}
