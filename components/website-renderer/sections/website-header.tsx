'use client'

import type { WebsiteSchema } from '@/lib/website-schema'
import type { PageItem } from '@/lib/website-pages'
import { SiteButton, onSiteNavClick } from '@/components/website-renderer/primitives'
import { useHrefNormalizer, useSiteNav } from '@/components/website-renderer/site-nav-context'
import { SocialLinks } from '@/components/website-renderer/social-links'
import { useBlogLink } from '@/components/website-renderer/site-blog-context'
import { withoutBlogLinks } from '@/lib/blog-site'
import { resolveHeaderMenu, withProductChildren, type MenuCategory, type MenuEntry } from '@/lib/site-menu'
import { useStoreCatalog } from '@/components/website-renderer/store-catalog-context'
import { categoryNames } from '@/lib/store-discovery'
import { DesktopSubmenuItem } from '@/components/website-renderer/sections/header-submenu'
import type { ResolvedSocialLink } from '@/lib/social-links'
import type { MenuContact } from '@/lib/menu-contact'
import { scrollSiteToTop } from '@/components/website-renderer/back-to-top'
import { useEffect, useRef, useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { requestOpenCart, useOptionalCart } from '@/components/store/cart-provider'
import {
  DESKTOP_NAV_SHOW_CLASS,
  MobileMenu,
  hamburgerBreakpoint,
  type MobileMenuItem,
} from '@/components/website-renderer/sections/mobile-menu'
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
  pageHref,
  storeSlug,
  cartSlug: cartSlugProp,
  lang = 'tr',
  homeHref,
  actions,
  socialLinks,
  contact,
  commerce = true,
  productCategories,
}: {
  /** Categories to list under the products entry; falls back to the live catalog in context. */
  productCategories?: MenuCategory[]
  /** Real contact details for the mobile menu panel; pass `resolveMenuContact(site)`. */
  contact?: MenuContact | null
  /** False on a catalog: hides the account link and the cart CTA (no cart exists). */
  commerce?: boolean
  /** Small icons next to the CTA; pass `resolveHeaderSocialLinks(site)` (empty hides them). */
  socialLinks?: ResolvedSocialLink[]
  lang?: 'tr' | 'en'
  navigation: WebsiteSchema['navigation']
  pages?: PageItem[]
  activeSlug?: string
  onNavigate?: (slug: string) => void
  /**
   * Real URL of a page. With it, page entries are `<a href>` links (crawlable, new-tab
   * friendly); without it they stay buttons driven by `onNavigate`.
   */
  pageHref?: (page: PageItem) => string | undefined
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
  const normalizeHref = useHrefNormalizer()
  const blog = useBlogLink()
  const cart = useOptionalCart()
  const cartSlug = cartSlugProp ?? storeSlug
  const cartCount = cart?.count ?? 0
  const [menuOpen, setMenuOpen] = useState(false)
  const catalogContext = useStoreCatalog()
  const categories: MenuCategory[] | undefined =
    productCategories ??
    (cartSlug && catalogContext?.products
      ? categoryNames(catalogContext.products).map((name) => ({
          key: `category:${name}`,
          label: name,
          href: `${storeListHref(cartSlug)}?kategori=${encodeURIComponent(name)}`,
        }))
      : undefined)
  const menuItems = buildMenuItems({
    entries: withProductChildren(
      resolveHeaderMenu({
        pages,
        links: withoutBlogLinks(navigation.links),
        blog: Boolean(blog),
        blogLabel: blog?.label ?? '',
        menuOrder: navigation.menuOrder,
        rawPages: Boolean(storeSlug),
      }),
      categories,
      navigation.productsSubmenu,
    ),
    activeSlug,
    onNavigate,
    pageHref,
    storeSlug,
    cartSlug,
    blog,
    nav,
    normalizeHref,
  })
  const showCtaInBar = Boolean(navigation.cta && !(!commerce && isCartCta(navigation.cta)))
  const ctaIsCart = Boolean(cartSlug && commerce && navigation.cta && isCartCta(navigation.cta))
  // A non-cart CTA moves into the menu panel below `md`, so it needs a menu to live in.
  const panelCta = showCtaInBar && !ctaIsCart && navigation.cta ? <SiteButton button={navigation.cta} /> : null
  const hasMenu =
    menuItems.length > 0 || Boolean(panelCta) || Boolean(socialLinks && socialLinks.length > 0) || Boolean(contact)
  const breakpoint = hamburgerBreakpoint(menuItems.length)

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
      className={`sticky top-[var(--site-sticky-offset,0px)] ${menuOpen ? 'z-50' : 'z-20'}`}
      style={{ borderBottom: '1px solid var(--site-border)' }}
    >
      {/* The blurred backdrop sits on its own layer: backdrop-filter on the header itself would
          become the containing block of the fixed mobile menu panel. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 backdrop-blur"
        style={{ backgroundColor: 'color-mix(in srgb, var(--site-bg) 82%, transparent)' }}
      />
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        {storeSlug ? (
          <a
            href={storeHomeHref(storeSlug)}
            aria-label={navigation.logoText}
            className="flex min-w-0 cursor-pointer items-center gap-2 text-lg font-bold tracking-tight md:shrink-0"
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
            {navigation.logo?.src && navigation.showLogoText === false ? null : <span className="truncate">{navigation.logoText}</span>}
          </a>
        ) : homeHref ? (
          <a
            href={homeHref}
            aria-label={navigation.logoText}
            data-header-logo
            className="flex min-w-0 cursor-pointer items-center gap-2 text-lg font-bold tracking-tight md:shrink-0"
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
            {navigation.logo?.src && navigation.showLogoText === false ? null : <span className="truncate">{navigation.logoText}</span>}
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
          className="flex min-w-0 cursor-pointer items-center gap-2 text-lg font-bold tracking-tight md:shrink-0"
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
          {navigation.logo?.src && navigation.showLogoText === false ? null : <span className="truncate">{navigation.logoText}</span>}
        </button>}

        <nav className={`hidden items-center gap-6 ${DESKTOP_NAV_SHOW_CLASS[breakpoint]}`}>
          {menuItems.map((item) =>
            item.children && item.children.length > 0 ? (
              <DesktopSubmenuItem key={item.key} item={item} lang={lang} />
            ) : item.href ? (
              <a
                key={item.key}
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                onClick={(e) => item.onSelect?.(e)}
                className="cursor-pointer text-sm font-medium transition-opacity hover:opacity-70 focus-visible:outline-offset-0"
                style={
                  item.active
                    ? { color: 'var(--site-primary)', fontWeight: 700 }
                    : { color: 'var(--site-muted-fg)' }
                }
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.key}
                type="button"
                aria-current={item.active ? 'page' : undefined}
                onClick={(e) => item.onSelect?.(e)}
                className="cursor-pointer text-sm font-medium transition-opacity hover:opacity-70"
                style={{
                  color: item.active ? 'var(--site-primary)' : 'var(--site-muted-fg)',
                  fontWeight: item.active ? 700 : 500,
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <SocialLinks
          links={socialLinks}
          variant="header"
          label={lang === 'en' ? 'Social media' : 'Sosyal medya'}
        />
        {actions}
        {commerce && shouldShowAccountLink(cartSlug) ? <StoreAccountLink slug={cartSlug} lang={lang} /> : null}
        {navigation.cta && showCtaInBar ? (
          ctaIsCart ? (
            <button
              type="button"
              onClick={() => requestOpenCart()}
              data-header-cart
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 sm:px-5"
              style={{ borderRadius: 'var(--site-radius)', fontFamily: 'var(--site-body-font)', backgroundColor: 'var(--site-primary)', color: 'var(--site-primary-fg)' }}
            >
              <ShoppingCart className="size-5 sm:hidden" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{navigation.cta.label}</span>
              {cartCount > 0 && (
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold"
                  style={{ backgroundColor: 'var(--site-bg)', color: 'var(--site-fg)' }}
                >
                  {cartCount}
                </span>
              )}
            </button>
          ) : (
            <div className="hidden md:block">
              <SiteButton button={navigation.cta} />
            </div>
          )
        ) : null}
        {hasMenu ? (
          <MobileMenu
            items={menuItems}
            cta={panelCta}
            socialLinks={socialLinks}
            contact={contact}
            lang={lang}
            breakpoint={breakpoint}
            onOpenChange={setMenuOpen}
          />
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

/** One resolved menu entry as both the desktop bar and the mobile panel draw it. */
function buildMenuItems({
  entries,
  activeSlug,
  onNavigate,
  pageHref,
  storeSlug,
  cartSlug,
  blog,
  nav,
  normalizeHref,
}: {
  entries: MenuEntry[]
  activeSlug?: string
  onNavigate?: (slug: string) => void
  pageHref?: (page: PageItem) => string | undefined
  storeSlug?: string
  cartSlug?: string
  blog: ReturnType<typeof useBlogLink>
  nav: ReturnType<typeof useSiteNav>
  normalizeHref: (href: string) => string
}): MobileMenuItem[] {
  const asAnchorClick = (href: string) => (e: React.MouseEvent<HTMLElement>) =>
    onSiteNavClick(e as React.MouseEvent<HTMLAnchorElement>, href, nav)

  return entries.map((entry): MobileMenuItem => {
    if (entry.kind === 'blog') {
      const href = blog?.href ?? '#'
      return { key: entry.key, label: entry.label, href, onSelect: asAnchorClick(href) }
    }
    if (entry.kind === 'link') {
      const { link } = entry
      const href =
        cartSlug && isProductsLink(link.label, link.href) ? storeListHref(cartSlug) : normalizeHref(link.href)
      return { key: link.label + link.href, label: link.label, href: href || '#', onSelect: asAnchorClick(href) }
    }
    const { page } = entry
    if (cartSlug && isProductsLink(page.title)) {
      const href = storeListHref(cartSlug)
      return { key: entry.key, label: entry.label, href, onSelect: asAnchorClick(href) }
    }
    // Store sub-pages (blog, legal, product list) have no in-memory page switcher,
    // so a real link to the page is the only way the entry can work there.
    if (!onNavigate && storeSlug) {
      const home = storeHomeHref(storeSlug)
      return { key: entry.key, label: entry.label, href: page.isHome ? home : `${home}/${page.slug}` }
    }
    const active = page.slug === activeSlug
    const href = pageHref?.(page)
    if (href) {
      return { key: entry.key, label: entry.label, href, active, onSelect: asAnchorClick(href) }
    }
    return { key: entry.key, label: entry.label, active, onSelect: () => onNavigate?.(page.slug) }
  })
}
