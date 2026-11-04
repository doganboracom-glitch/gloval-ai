import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

function renderShell({
  pathname = '/admin',
  lang = 'tr',
  referralsEnabled = true,
}: {
  pathname?: string
  lang?: 'tr' | 'en'
  referralsEnabled?: boolean
} = {}) {
  state.pathname = pathname
  state.lang = lang

  return renderToStaticMarkup(
    <AdminShell adminEmail="admin@example.test" referralsEnabled={referralsEnabled}>
      <div>Admin content</div>
    </AdminShell>,
  )
}

function getNavLink(html: string, href: string) {
  return html.match(new RegExp(`<a\\b(?=[^>]*\\bhref="${href}")[^>]*>`))?.[0] ?? null
}

describe('AdminShell referrals navigation', () => {
  beforeEach(() => {
    state.lang = 'tr'
    state.pathname = '/admin'
  })

  it('renders the localized referral link after AI credits when enabled', () => {
    const turkish = renderShell()
    const creditsIndex = turkish.indexOf('>AI Kredileri</a>')
    const referralsIndex = turkish.indexOf('>Satış Ortaklığı</a>')

    expect(getNavLink(turkish, '/admin/referrals')).toBeTruthy()
    expect(creditsIndex).toBeGreaterThanOrEqual(0)
    expect(referralsIndex).toBeGreaterThan(creditsIndex)

    const english = renderShell({ lang: 'en' })
    expect(english).toContain('>Referrals</a>')
    expect(getNavLink(english, '/admin/referrals')).toBeTruthy()
  })

  it('activates only the referrals route and its descendants', () => {
    for (const pathname of ['/admin/referrals', '/admin/referrals/partners']) {
      expect(getNavLink(renderShell({ pathname }), '/admin/referrals')).toContain(
        'aria-current="page"',
      )
    }

    for (const pathname of ['/admin/users', '/admin/referrals-extra']) {
      expect(getNavLink(renderShell({ pathname }), '/admin/referrals')).not.toContain(
        'aria-current="page"',
      )
    }
  })

  it('does not highlight the domains link on the domain handover route', () => {
    const html = renderShell({ pathname: '/admin/domains/handover' })

    expect(getNavLink(html, '/admin/domains')).not.toContain('aria-current="page"')
    expect(getNavLink(html, '/admin/domains/handover')).toContain('aria-current="page"')
  })

  it('hides the referral link when the feature flag is off', () => {
    expect(getNavLink(renderShell({ referralsEnabled: false }), '/admin/referrals')).toBeNull()
  })
})
