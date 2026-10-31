// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { MouseEventHandler, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'
import { dictionary, type Lang } from '@/lib/i18n'
import { SUPPORTED_LOCALES } from '@/lib/locale-registry'

const state: { lang: Lang } = { lang: 'tr' }

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({ lang: state.lang, t: dictionary[state.lang] }),
}))
vi.mock('@/components/language-switcher', () => ({ LanguageSwitcher: () => null }))
vi.mock('@/components/link-button', () => ({
  LinkButton: ({ href, children, className, onClick }: {
    href: string
    children: ReactNode
    className?: string
    onClick?: MouseEventHandler<HTMLAnchorElement>
  }) => <a href={href} className={className} onClick={onClick}>{children}</a>,
}))
vi.mock('@/components/brand-logo', () => ({ BrandLogo: () => <span /> }))
vi.mock('@/components/scroll-to-top', () => ({ ScrollToTop: () => null, scrollWindowToTop: () => {} }))
vi.mock('@/components/payment-badges', () => ({ PaymentBadges: () => null }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}))

const BEFORE = new Date('2026-11-15T12:00:00+03:00')
const AFTER = new Date('2026-12-29T00:00:01+03:00')

function openMobileMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
  const nav = document.querySelector<HTMLElement>('header > div.border-t nav')
  if (!nav) throw new Error('Mobile navigation did not open')
  return nav
}

function getDomainLink(nav: HTMLElement) {
  return within(nav).getAllByRole('link').find((link) => link.getAttribute('href') === '/alan-adi-sorgula')
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  state.lang = 'tr'
})

describe('site header navigation', () => {
  it('keeps all landing page sections accessible in desktop and mobile menus', () => {
    render(<SiteHeader />)
    const expectedHrefs = ['#how', '#features', '#showcase', '#pricing']
    const desktopNav = document.querySelector<HTMLElement>('header nav')!
    const desktopHrefs = within(desktopNav).getAllByRole('link').map((link) => link.getAttribute('href'))

    expect(desktopHrefs).toEqual(expect.arrayContaining(expectedHrefs))

    const mobileNav = openMobileMenu()
    const mobileHrefs = within(mobileNav).getAllByRole('link').map((link) => link.getAttribute('href'))

    expect(mobileHrefs).toEqual(expect.arrayContaining(expectedHrefs))
  })

  it('keeps the domain and Ads links out of the desktop navigation', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    render(<SiteHeader />)
    const desktopNav = document.querySelector<HTMLElement>('header nav')!

    expect(within(desktopNav).queryByRole('link', { name: /Domain Sorgula ve Satın Al/ })).toBeNull()
    expect(within(desktopNav).queryByRole('link', { name: /Reklam Ver/ })).toBeNull()
  })

  it('shows domain search and the existing Ads link in the mobile menu only', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    render(<SiteHeader />)
    const mobileNav = openMobileMenu()
    const domainLink = getDomainLink(mobileNav)
    const adsLink = within(mobileNav).getByRole('link', { name: /Reklam Ver/ })
    const mobileLinks = within(mobileNav).getAllByRole('link')

    expect(domainLink?.getAttribute('href')).toBe('/alan-adi-sorgula')
    expect(domainLink?.textContent).toContain(dictionary.tr.domainSearch.footerLink)
    expect(within(domainLink!).getByTestId('mobile-nav-domain-new-badge').textContent)
      .toBe(dictionary.tr.domainSearch.footerBadgeNew)
    expect(adsLink.getAttribute('href')).toBe('/ads')
    expect(adsLink.contains(screen.getByTestId('mobile-nav-ads-soon-badge'))).toBe(true)
    expect(mobileLinks.findIndex((link) => link.getAttribute('href') === '/alan-adi-sorgula'))
      .toBeLessThan(mobileLinks.indexOf(adsLink))

    const desktopNav = document.querySelectorAll<HTMLElement>('header nav')[0]
    expect(within(desktopNav).queryByRole('link', { name: /Domain Sorgula ve Satın Al/ })).toBeNull()
    expect(within(desktopNav).queryByRole('link', { name: /Reklam Ver/ })).toBeNull()
  })

  it('keeps the mobile Ads link gated by the existing feature flag', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '')
    render(<SiteHeader />)
    const mobileNav = openMobileMenu()

    expect(within(mobileNav).queryByRole('link', { name: /Reklam Ver/ })).toBeNull()
  })

  it.each(SUPPORTED_LOCALES)('%s uses its localized domain label and badge', (locale) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(BEFORE)
    state.lang = locale
    render(<SiteHeader />)
    const mobileNav = openMobileMenu()
    const domainLink = getDomainLink(mobileNav)

    expect(domainLink?.textContent).toContain(dictionary[locale].domainSearch.footerLink)
    expect(domainLink?.querySelector('[data-testid="mobile-nav-domain-new-badge"]')?.textContent)
      .toBe(dictionary[locale].domainSearch.footerBadgeNew)
  })

  it('keeps the same New badge treatment and cutoff as the footer link', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(BEFORE)
    render(<><SiteHeader /><SiteFooter /></>)
    const mobileNav = openMobileMenu()
    const headerBadge = within(mobileNav).getByTestId('mobile-nav-domain-new-badge')
    const footerBadge = screen.getByTestId('domain-new-badge')

    expect(headerBadge.className).toBe(footerBadge.className)
    expect(headerBadge.textContent).toBe(footerBadge.textContent)

    cleanup()
    vi.setSystemTime(AFTER)
    render(<><SiteHeader /><SiteFooter /></>)
    const expiredMobileNav = openMobileMenu()

    expect(within(expiredMobileNav).queryByTestId('mobile-nav-domain-new-badge')).toBeNull()
    expect(screen.queryByTestId('domain-new-badge')).toBeNull()
    expect(getDomainLink(expiredMobileNav)?.getAttribute('href')).toBe('/alan-adi-sorgula')
  })
})
