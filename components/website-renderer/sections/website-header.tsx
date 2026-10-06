'use client'

import type { WebsiteSchema } from '@/lib/website-schema'
import type { PageItem } from '@/lib/website-pages'
import { SiteButton, onSiteNavClick } from '@/components/website-renderer/primitives'
import { useSiteNav } from '@/components/website-renderer/site-nav-context'
import { scrollSiteToTop } from '@/components/website-renderer/back-to-top'

export function WebsiteHeader({
  navigation,
  pages,
  activeSlug,
  onNavigate,
}: {
  navigation: WebsiteSchema['navigation']
  pages?: PageItem[]
  activeSlug?: string
  onNavigate?: (slug: string) => void
}) {
  const nav = useSiteNav()
  // Use real page navigation when the site has more than one page; otherwise
  // fall back to the in-page anchor links from the schema.
  const multiPage = (pages?.length ?? 0) > 1

  return (
    <header
      className="sticky top-0 z-20 backdrop-blur"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--site-bg) 82%, transparent)',
        borderBottom: '1px solid var(--site-border)',
      }}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <button
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
          {navigation.logo?.src ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URI / arbitrary remote logo
            <img
              src={navigation.logo.src}
              alt={navigation.logo.alt || navigation.logoText}
              // Sizes are driven by CSS custom properties with per-breakpoint
              // fallbacks (`var(--x, default)`), so a site with none of these
              // set renders EXACTLY the previous fixed h-12/h-16 + max-w box —
              // only a site whose owner explicitly resized the logo deviates.
              className="[height:var(--logo-h,48px)] [max-width:var(--logo-maxw,200px)] [width:var(--logo-mobile-w,auto)] object-contain md:[height:var(--logo-h,64px)] md:[max-width:var(--logo-maxw,280px)] md:[width:var(--logo-w,auto)]"
              style={
                {
                  '--logo-h': navigation.logo.height
                    ? `${navigation.logo.height}px`
                    : navigation.logo.width || navigation.logo.mobileWidth
                      ? 'auto'
                      : undefined,
                  '--logo-maxw':
                    navigation.logo.width || navigation.logo.height || navigation.logo.mobileWidth
                      ? 'none'
                      : undefined,
                  '--logo-w': navigation.logo.width ? `${navigation.logo.width}px` : undefined,
                  '--logo-mobile-w': navigation.logo.mobileWidth
                    ? `${navigation.logo.mobileWidth}px`
                    : navigation.logo.width
                      ? `${navigation.logo.width}px`
                      : undefined,
                } as React.CSSProperties
              }
            />
          ) : null}
          <span>{navigation.logoText}</span>
        </button>

        <nav className="hidden items-center gap-6 md:flex">
          {multiPage
            ? pages!.map((page) => {
                const isActive = page.slug === activeSlug
                return (
                  <button
                    key={page.slug}
                    type="button"
                    onClick={() => onNavigate?.(page.slug)}
                    className="text-sm font-medium transition-opacity hover:opacity-70"
                    style={{
                      color: isActive ? 'var(--site-primary)' : 'var(--site-muted-fg)',
                      fontWeight: isActive ? 700 : 500,
                    }}
                  >
                    {page.title}
                  </button>
                )
              })
            : navigation.links.map((link) => (
                <a
                  key={link.label + link.href}
                  href={link.href || '#'}
                  onClick={(e) => onSiteNavClick(e, link.href, nav)}
                  className="text-sm font-medium transition-opacity hover:opacity-70"
                  style={{ color: 'var(--site-muted-fg)' }}
                >
                  {link.label}
                </a>
              ))}
        </nav>

        {navigation.cta ? <SiteButton button={navigation.cta} /> : <span />}
      </div>
    </header>
  )
}
