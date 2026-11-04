// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  lang: 'tr' as 'tr' | 'en',
  pathname: '/admin' as string,
}))

type LinkProps = ComponentProps<'a'> & { href: string }

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: LinkProps) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }))
vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({ lang: state.lang }),
}))
vi.mock('@/components/language-switcher', () => ({ LanguageSwitcher: () => null }))
vi.mock('@/components/brand-logo', () => ({ BrandLogo: () => null }))
vi.mock('@/lib/blog-admin-copy', () => ({ blogAdminT: () => ({ nav: 'Blog' }) }))
vi.mock('@/lib/admin/overdue-copy', () => ({ overdueT: () => ({ nav: 'Overdue' }) }))
vi.mock('@/lib/billing-profile-copy', () => ({
  getBillingProfileCopy: () => ({ adminNav: 'Billing profiles' }),
}))
vi.mock('@/lib/invoices/copy', () => ({ getInvoiceCopy: () => ({ nav: 'Invoices' }) }))

import { AdminShell } from './admin-shell'

afterEach(() => cleanup())

type RenderShellOptions = {
  pathname?: string
  lang?: 'tr' | 'en'
  referralsEnabled?: boolean
}

function renderShell({
  pathname = '/admin',
  lang = 'tr',
  referralsEnabled = true,
}: RenderShellOptions = {}) {
  state.pathname = pathname
  state.lang = lang

  return renderToStaticMarkup(
    <AdminShell adminEmail="admin@example.test" referralsEnabled={referralsEnabled}>
      <div>Admin content</div>
    </AdminShell>,
  )
}

function renderInteractiveShell({
  pathname = '/admin',
  lang = 'tr',
  referralsEnabled = true,
}: RenderShellOptions = {}) {
  state.pathname = pathname
  state.lang = lang

  return render(
    <AdminShell adminEmail="admin@example.test" referralsEnabled={referralsEnabled}>
      <div>Admin content</div>
    </AdminShell>,
  )
}

function getNavLink(html: string, href: string) {
  return html.match(new RegExp(`<a\\b(?=[^>]*\\bhref="${href}")[^>]*>`))?.[0] ?? null
}

function getReferralToggle(html: string) {
  return html.match(
    /<button\b[^>]*aria-controls="admin-nav-referrals-sections"[^>]*>/u,
  )?.[0] ?? null
}

describe('AdminShell referrals navigation', () => {
  beforeEach(() => {
    state.lang = 'tr'
    state.pathname = '/admin'
  })

  it('renders localized section links after AI credits when enabled', () => {
    const turkish = renderShell()
    const creditsIndex = turkish.indexOf('>AI Kredileri</a>')
    const referralsIndex = turkish.indexOf('>Satış Ortaklığı</span>')
    const adsIndex = turkish.indexOf('href="/admin/ads-publishing"')

    expect(getReferralToggle(turkish)).toBeTruthy()
    expect(creditsIndex).toBeGreaterThanOrEqual(0)
    expect(referralsIndex).toBeGreaterThan(creditsIndex)
    expect(adsIndex).toBeGreaterThan(referralsIndex)
    expect(getNavLink(turkish, '/admin/referrals#partners')).toBeTruthy()
    expect(getNavLink(turkish, '/admin/referrals#payouts')).toBeTruthy()
    expect(getNavLink(turkish, '/admin/referrals#reversals')).toBeTruthy()
    expect(turkish).toContain('>Ortaklar</a>')
    expect(turkish).toContain('>Ödeme talepleri</a>')
    expect(turkish).toContain('>Komisyon geri alma</a>')

    const english = renderShell({ lang: 'en' })
    expect(english).toContain('>Referrals</span>')
    expect(english).toContain('>Partners</a>')
    expect(english).toContain('>Payout requests</a>')
    expect(english).toContain('>Commission reversals</a>')
  })

  it('starts collapsed off-route and toggles its anchor list accessibly', () => {
    renderInteractiveShell()
    const toggle = screen.getByRole('button', { name: 'Satış Ortaklığı' })
    const submenu = document.getElementById(toggle.getAttribute('aria-controls') ?? '')

    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(submenu).not.toBeNull()
    expect(submenu!.hasAttribute('hidden')).toBe(true)

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(submenu!.hasAttribute('hidden')).toBe(false)
    expect(within(submenu!).getAllByRole('link')).toHaveLength(3)
    expect(
      within(submenu!).getByRole('link', { name: 'Ortaklar' }).getAttribute('href'),
    ).toBe('/admin/referrals#partners')

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(submenu!.hasAttribute('hidden')).toBe(true)
  })

  it('opens and highlights only on the referrals route and its descendants', () => {
    for (const pathname of ['/admin/referrals', '/admin/referrals/partners']) {
      const toggle = getReferralToggle(renderShell({ pathname }))
      expect(toggle).toContain('aria-expanded="true"')
      expect(toggle).toContain('bg-brand/15')
    }

    for (const pathname of ['/admin/users', '/admin/referrals-extra']) {
      const toggle = getReferralToggle(renderShell({ pathname }))
      expect(toggle).toContain('aria-expanded="false"')
      expect(toggle).not.toContain('bg-brand/15')
    }
  })

  it('keeps existing descendant routes active without matching sibling prefixes', () => {
    const descendantRoutes = [
      ['/admin/users/member-1', '/admin/users'],
      ['/admin/blog/post-1', '/admin/blog'],
      ['/admin/support/ticket-1', '/admin/support'],
      ['/admin/maker-requests/request-1', '/admin/maker-requests'],
      ['/admin/mail/aliases', '/admin/mail'],
    ]

    for (const [pathname, href] of descendantRoutes) {
      expect(getNavLink(renderShell({ pathname }), href)).toContain('aria-current="page"')
    }

    const handover = renderShell({ pathname: '/admin/domains/handover' })
    expect(getNavLink(handover, '/admin/domains')).not.toContain('aria-current="page"')
    expect(getNavLink(handover, '/admin/domains/handover')).toContain('aria-current="page"')

    const invoices = renderShell({ pathname: '/admin/billing/invoices' })
    expect(getNavLink(invoices, '/admin/billing')).not.toContain('aria-current="page"')
    expect(getNavLink(invoices, '/admin/billing/invoices')).toContain('aria-current="page"')
  })

  it('hides all referral navigation when the feature flag is off', () => {
    const html = renderShell({ referralsEnabled: false })
    expect(getReferralToggle(html)).toBeNull()
    expect(getNavLink(html, '/admin/referrals#partners')).toBeNull()
  })
})
