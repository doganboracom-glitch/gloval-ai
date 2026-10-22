'use client'

import type { NavLink, Section, WebsiteSchema } from '@/lib/website-schema'
import { GlovalBadge } from '@/components/website-renderer/gloval-badge'
import { PaymentBadges } from '@/components/payment-badges'
import { onSiteNavClick } from '@/components/website-renderer/primitives'
import { SocialLinks } from '@/components/website-renderer/social-links'
import { resolveFooterSocialLinks } from '@/lib/social-links'
import { useHrefNormalizer, useSiteNav } from '@/components/website-renderer/site-nav-context'
import { useBlogLink } from '@/components/website-renderer/site-blog-context'
import { withBlogFooterLink, withoutBlogLinks } from '@/lib/blog-site'
import { pageMenuLabel, resolveFooterPages } from '@/lib/site-menu'
import { pageNavItems, pagePath } from '@/lib/website-pages'
import { OPEN_CART_EVENT } from '@/components/store/cart-provider'
import { hasAnyPaymentBadge, type PaymentBadgeSet } from '@/lib/payment-badges'
import {
  FOOTER_CART_HREF,
  resolveFooterColumns,
  resolveFooterLegal,
  resolveStoreEssentialPageLinks,
  validateFooterHref,
} from '@/lib/footer-links'

type FooterData = Extract<Section, { type: 'footer' }>

/**
 * Grid classes for the link columns that sit beside the brand block:
 * mobile 2 columns, tablet 2, desktop 3 (4 when the footer has 4+ groups).
 */
export function footerColumnsGridClass(columnCount: number): string {
  const desktop = columnCount >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
  return `grid grid-cols-2 gap-x-6 gap-y-8 sm:gap-x-8 ${desktop}`
}

/** Layout of the upper footer area: brand left, columns right on desktop. */
export const FOOTER_TOP_CLASS = 'flex flex-col gap-10 lg:flex-row lg:justify-between lg:gap-16'

/** Bottom bar: copyright | official texts | platform credit. */
export const FOOTER_BAR_CLASS =
  'mt-10 flex flex-col gap-4 border-t pt-6 pe-16 text-xs sm:pe-20 md:flex-row md:flex-wrap md:items-center md:justify-between'

export const FOOTER_LEGAL_CLASS = 'flex flex-wrap items-center gap-x-3 gap-y-1'

function FooterLink({
  link,
  site,
  className,
  style,
}: {
  link: NavLink
  site?: WebsiteSchema | null
  className: string
  style: React.CSSProperties
}) {
  const nav = useSiteNav()
  const normalizeHref = useHrefNormalizer()
  const check = validateFooterHref(link.href, site)
  const kind = check.ok ? check.kind : null
  const href = normalizeHref(link.href.trim())

  if (kind === 'cart') {
    return (
      <a
        href={FOOTER_CART_HREF}
        onClick={(e) => {
          e.preventDefault()
          window.dispatchEvent(new Event(OPEN_CART_EVENT))
        }}
        className={className}
        style={style}
      >
        {link.label}
      </a>
    )
  }

  if (kind === 'external') {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style}>
        {link.label}
      </a>
    )
  }

  return (
    <a
      href={href}
      onClick={(e) => onSiteNavClick(e, href, nav)}
      className={className}
      style={style}
    >
      {link.label}
    </a>
  )
}

export function WebsiteFooter({
  data,
  logoText,
  lang = 'tr',
  showBranding = true,
  paymentBadges = null,
  site = null,
}: {
  data: FooterData
  logoText: string
  lang?: 'tr' | 'en'
  showBranding?: boolean
  /** Published store only: the payment marks the store really accepts. */
  paymentBadges?: PaymentBadgeSet | null
  /** Used to verify link targets (pages, sections, store) before showing them. */
  site?: WebsiteSchema | null
}) {
  const blogLink = useBlogLink()
  const resolvedColumns = resolveFooterColumns(data.columns, site)
  const withBlog = blogLink
    ? withBlogFooterLink(resolvedColumns, { label: blogLink.label, href: blogLink.href }, lang)
    : resolvedColumns.map((col) => ({ ...col, links: withoutBlogLinks(col.links) }))
  const columns = site
    ? resolveFooterPages(pageNavItems(site), site.navigation.menuOrder).reduce((acc, page) => {
        const href = pagePath(site, page.slug)
        if (acc.some((col) => col.links.some((l) => l.href === href))) return acc
        return withBlogFooterLink(acc, { label: pageMenuLabel(page), href }, lang)
      }, withBlog)
    : withBlog
  const legal = [
    ...resolveStoreEssentialPageLinks(site, columns, lang),
    ...resolveFooterLegal(data.legal, site, lang),
  ]
  const legalLabel = lang === 'en' ? 'Legal' : 'Resmi yazılar'

  return (
    <footer
      className="px-6 py-12"
      style={{
        backgroundColor: 'var(--site-card)',
        borderTop: '1px solid var(--site-border)',
      }}
    >
      <div className="mx-auto w-full max-w-5xl">
        <div className={FOOTER_TOP_CLASS} data-footer-top>
          <div className="lg:max-w-xs lg:shrink-0">
            <span
              className="text-lg font-bold tracking-tight"
              style={{
                fontFamily: 'var(--site-heading-font)',
                color: 'var(--site-fg)',
              }}
            >
              {logoText}
            </span>
            {data.tagline ? (
              <p
                className="mt-2 max-w-xs text-sm leading-relaxed"
                style={{ color: 'var(--site-muted-fg)' }}
              >
                {data.tagline}
              </p>
            ) : null}
            <SocialLinks
              links={resolveFooterSocialLinks(site)}
              variant="footer"
              label={lang === 'en' ? 'Social media' : 'Sosyal medya'}
            />
          </div>

          {columns.length > 0 ? (
            <div className={footerColumnsGridClass(columns.length)} data-footer-columns>
              {columns.map((col) => (
                <div key={col.title} className="min-w-0">
                  <p
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--site-fg)' }}
                  >
                    {col.title}
                  </p>
                  <ul className="mt-3 grid gap-2">
                    {col.links.map((link) => (
                      <li key={link.label + link.href}>
                        <FooterLink
                          link={link}
                          site={site}
                          className="text-sm transition-opacity hover:opacity-70"
                          style={{ color: 'var(--site-muted-fg)' }}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div
          // The trailing padding keeps the credit clear of the floating
          // BackToTop control, which overlaps this row at the page bottom.
          className={FOOTER_BAR_CLASS}
          data-footer-bar
          style={{
            borderColor: 'var(--site-border)',
            color: 'var(--site-muted-fg)',
          }}
        >
          <span>{data.copyright ?? `© ${new Date().getFullYear()} ${logoText}`}</span>
          {legal.length > 0 ? (
            <nav aria-label={legalLabel} data-footer-legal>
              <ul className={FOOTER_LEGAL_CLASS}>
                {legal.map((link, i) => (
                  <li key={link.label + link.href} className="flex items-center gap-3">
                    {i > 0 ? (
                      <span aria-hidden="true" className="opacity-40">
                        |
                      </span>
                    ) : null}
                    <FooterLink
                      link={link}
                      site={site}
                      className="transition-opacity hover:opacity-70"
                      style={{ color: 'var(--site-muted-fg)' }}
                    />
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {/* Platform credit, opposite the copyright line. Rendered here from
              fixed markup rather than from the editable schema, so it cannot be
              removed from the editor. */}
          {showBranding ? <GlovalBadge lang={lang} /> : null}
        </div>
        {hasAnyPaymentBadge(paymentBadges) ? (
          <PaymentBadges badges={paymentBadges} variant="site" lang={lang} className="mt-6" />
        ) : null}
      </div>
    </footer>
  )
}
