'use client'

import type { WebsiteSchema } from '@/lib/website-schema'
import type { PageItem } from '@/lib/website-pages'
import { SiteButton, onSiteNavClick } from '@/components/website-renderer/primitives'
import { useSiteNav } from '@/components/website-renderer/site-nav-context'
import { SocialLinks } from '@/components/website-renderer/social-links'
import type { ResolvedSocialLink } from '@/lib/social-links'
import { scrollSiteToTop } from '@/components/website-renderer/back-to-top'
import { useEffect, useRef } from 'react'
import { requestOpenCart, useOptionalCart } from '@/components/store/cart-provider'
import { StoreAccountLink } from '@/components/website-renderer/store-account-link'
import {
  isCartCta,
  isProductsLink,
  shouldShowAccountLink,
  storeHomeHref,
  storeListHref,
} from '@/lib/store-header-links'

export function WebsiteHeader({
  navigation,
  pages,
  activeSlug,
  onNavigate,
  storeSlug,
  cartSlug: cartSlugProp,
  lang = 'tr',
  homeHref,
  actions,
  socialLinks,
  commerce = true,
  blog,
}: {
  /** Real link to the site's blog; pass only when at least one post is public. */
  blog?: { href: string; label: string } | null
  /** False on a catalog: hides the account link and the cart CTA (no cart exists). */
  commerce?: boolean
  /** Small icons next to the CTA; pass `resolveHeaderSocialLinks(site)` (empty hides them). */
  socialLinks?: ResolvedSocialLink[]
  lang?: 'tr' | 'en'
  navigation: WebsiteSchema['navigation']
  pages?: PageItem[]
  activeSlug?: string
  onNavigate?: (slug: string) => void
  storeSlug?: string
  /** Store slug for the cart CTA / product links; set on every storefront page, home included. */
  cartSlug?: string
  /**
   * Demo sub-pages only: turns the logo into a real link to this href (the demo
   * home) instead of the in-page scroll-to-top button. Ignored on a storefront.
   */
  homeHref?: string
  /** Extra header controls rendered just before the CTA (demo cart/account buttons). */
  actions?: React.ReactNode
}) {
  const nav = useSiteNav()
  const cart = useOptionalCart()
  const cartSlug = cartSlugProp ?? storeSlug
  const cartCount = cart?.count ?? 0
  // Use real page navigation when the site has more than one page; otherwise
  // fall back to the in-page anchor links from the schema.
  const multiPage = (pages?.length ?? 0) > 1

  const headerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const root = el.ownerDocument.documentElement
    const publish = () => root.style.setProperty('--site-header-h', `${el.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--site-header-h')
    }
  }, [])

  return (
    <header
      ref={headerRef}
      className="sticky top-[var(--site-sticky-offset,0px)] z-20 backdrop-blur"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--site-bg) 82%, transparent)',
        borderBottom: '1px solid var(--site-border)',
      }}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
        {storeSlug ? (
          <a
            href={storeHomeHref(storeSlug)}
            aria-label={navigation.logoText}
            className="flex shrink-0 cursor-pointer items-center gap-2 text-lg font-bold tracking-tight"
            style={{
              fontFamily: 'var(--site-heading-font)',
              color: 'var(--site-fg)',
              justifyContent:
                navigation.logo?.align === 'center'
                  ? 'center'
                  : navigation.logo?.align === 'right'
                    ? 'flex-end'
                    : undefined,
            }}
          >
            {navigation.logo?.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={navigation.logo.src} alt={navigation.logo.alt || navigation.logoText} className="[height:var(--logo-h,48px)] [max-width:var(--logo-maxw,200px)] [width:var(--logo-mobile-w,auto)] object-contain md:[height:var(--logo-h,64px)] md:[max-width:var(--logo-maxw,280px)] md:[width:var(--logo-w,auto)]" />
            ) : null}
            {navigation.logo?.src && navigation.showLogoText === false ? null : <span>{navigation.logoText}</span>}
          </a>
        ) : homeHref ? (
          <a
            href={homeHref}
            aria-label={navigation.logoText}
            data-header-logo
            className="flex shrink-0 cursor-pointer items-center gap-2 text-lg font-bold tracking-tight"
            style={{
              fontFamily: 'var(--site-heading-font)',
              color: 'var(--site-fg)',
              justifyContent:
                navigation.logo?.align === 'center'
                  ? 'center'
                  : navigation.logo?.align === 'right'
                    ? 'flex-end'
                    : undefined,
            }}
          >
            <LogoImage navigation={navigation} />
            {navigation.logo?.src && navigation.showLogoText === false ? null : <span>{navigation.logoText}</span>}
          </a>
        ) : <button
          type="button"
          aria-label={navigation.logoText}
          onClick={(e) => {
            // The logo always behaves like a home link: switch back to the home
            // page when the site is multi-page, then scroll to the very top.
            const home = pages?.find((p) => p.isHome)?.slug
            if (home && onNavigate && home !== activeSlug) onNavigate(home)
            scrollSiteToTop(e.currentTarget)
          }}
          className="flex shrink-0 cursor-pointer items-center gap-2 text-lg font-bold tracking-tight"
          style={{
            fontFamily: 'var(--site-heading-font)',
            color: 'var(--site-fg)',
            justifyContent:
              navigation.logo?.align === 'center'
                ? 'center'
                : navigation.logo?.align === 'right'
                  ? 'flex-end'
                  : undefined,
          }}
        >
          <LogoImage navigation={navigation} />
          {navigation.logo?.src && navigation.showLogoText === false ? null : <span>{navigation.logoText}</span>}
        </button>}

        <nav className="hidden items-center gap-6 md:flex">
          {multiPage
            ? pages!.map((page) => {
                const isActive = page.slug === activeSlug
                if (cartSlug && isProductsLink(page.title)) {
                  return (
                    <a
                      key={page.slug}
                      href={storeListHref(cartSlug)}
                      onClick={(e) => onSiteNavClick(e, storeListHref(cartSlug), nav)}
                      className="cursor-pointer text-sm font-medium transition-opacity hover:opacity-70"
                      style={{ color: 'var(--site-muted-fg)' }}
                    >
                      {page.title}
                    </a>
                  )
                }
                return (
                  <button
                    key={page.slug}
                    type="button"
                    onClick={() => onNavigate?.(page.slug)}
                    className="cursor-pointer text-sm font-medium transition-opacity hover:opacity-70"
                    style={{
                      color: isActive ? 'var(--site-primary)' : 'var(--site-muted-fg)',
                      fontWeight: isActive ? 700 : 500,
                    }}
                  >
                    {page.title}
                  </button>
                )
              })
            : navigation.links.map((link) => {
                const href =
                  cartSlug && isProductsLink(link.label, link.href)
                    ? storeListHref(cartSlug)
                    : link.href
                return (
                <a
                  key={link.label + link.href}
                  href={href || '#'}
                  onClick={(e) => onSiteNavClick(e, href, nav)}
                  className="cursor-pointer text-sm font-medium transition-opacity hover:opacity-70"
                  style={{ color: 'var(--site-muted-fg)' }}
                >
                  {link.label}
                </a>
                )
              })}
          {blog ? (
            <a
              href={blog.href}
              className="cursor-pointer text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: 'var(--site-muted-fg)' }}
            >
              {blog.label}
            </a>
          ) : null}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <SocialLinks
          links={socialLinks}
          variant="header"
          label={lang === 'en' ? 'Social media' : 'Sosyal medya'}
        />
        {actions}
        {commerce && shouldShowAccountLink(cartSlug) ? <StoreAccountLink slug={cartSlug} lang={lang} /> : null}
        {navigation.cta && !(!commerce && isCartCta(navigation.cta)) ? (
          cartSlug && commerce && isCartCta(navigation.cta) ? (
            <button
              type="button"
              onClick={() => requestOpenCart()}
              data-header-cart
              className="inline-flex cursor-pointer items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ borderRadius: 'var(--site-radius)', fontFamily: 'var(--site-body-font)', backgroundColor: 'var(--site-primary)', color: 'var(--site-primary-fg)' }}
            >
              {navigation.cta.label}
              {cartCount > 0 && (
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold"
                  style={{ backgroundColor: 'var(--site-bg)', color: 'var(--site-fg)' }}
                >
                  {cartCount}
                </span>
              )}
            </button>
          ) : <SiteButton button={navigation.cta} />
        ) : null}
        </div>
      </div>
    </header>
  )
}

function LogoImage({ navigation }: { navigation: WebsiteSchema['navigation'] }) {
  if (!navigation.logo?.src) return null
  const logo = navigation.logo
  return (
    // eslint-disable-next-line @next/next/no-img-element -- data URI / arbitrary remote logo
    <img
      src={logo.src}
      alt={logo.alt || navigation.logoText}
      // Sizes are driven by CSS custom properties with per-breakpoint
      // fallbacks (`var(--x, default)`), so a site with none of these
      // set renders EXACTLY the previous fixed h-12/h-16 + max-w box —
      // only a site whose owner explicitly resized the logo deviates.
      className="[height:var(--logo-h,48px)] [max-width:var(--logo-maxw,200px)] [width:var(--logo-mobile-w,auto)] object-contain md:[height:var(--logo-h,64px)] md:[max-width:var(--logo-maxw,280px)] md:[width:var(--logo-w,auto)]"
      style={
        {
          '--logo-h': logo.height ? `${logo.height}px` : logo.width || logo.mobileWidth ? 'auto' : undefined,
          '--logo-maxw': logo.width || logo.height || logo.mobileWidth ? 'none' : undefined,
          '--logo-w': logo.width ? `${logo.width}px` : undefined,
          '--logo-mobile-w': logo.mobileWidth
            ? `${logo.mobileWidth}px`
            : logo.width
              ? `${logo.width}px`
              : undefined,
        } as React.CSSProperties
      }
    />
  )
}
