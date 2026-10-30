// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteFooter } from './site-footer'
import { dictionary, type Lang } from '@/lib/i18n'
import { SUPPORTED_LOCALES } from '@/lib/locale-registry'
import {
  ADS_LINK_NEW_UNTIL,
  DOMAIN_LINK_NEW_UNTIL,
  isAdsLinkNewBadgeActive,
  isDomainLinkNewBadgeActive,
} from '@/lib/footer-new-badge'

const state: { lang: Lang } = { lang: 'tr' }

vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({ lang: state.lang, t: dictionary[state.lang] }),
}))
vi.mock('@/components/brand-logo', () => ({ BrandLogo: () => <span /> }))
vi.mock('@/components/payment-badges', () => ({ PaymentBadges: () => <span /> }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

const BEFORE = new Date('2026-11-15T12:00:00+03:00')
const AFTER = new Date('2026-12-29T00:00:01+03:00')

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  state.lang = 'tr'
})

const ADS_BADGE_BEFORE = new Date('2026-12-15T12:00:00+03:00')
const ADS_BADGE_AFTER = new Date('2026-12-30T00:00:01+03:00')

describe('footer GLOVAL Ads link badge', () => {
  it('shows the "Yeni" badge next to the link when the flag is on and the date is before the cutoff', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    render(<SiteFooter now={ADS_BADGE_BEFORE} />)
    const link = screen.getByRole('link', { name: /GLOVAL Ads/ })
    expect(link.getAttribute('href')).toBe('/ads')
    expect(link.contains(screen.getByTestId('ads-new-badge'))).toBe(true)
    expect(screen.getByTestId('ads-new-badge').textContent).toBe('Yeni')
  })

  it('uses the same badge look as the domain link badge', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    render(<SiteFooter now={BEFORE} />)
    expect(screen.getByTestId('ads-new-badge').className).toBe(
      screen.getByTestId('domain-new-badge').className,
    )
  })

  it('shows the English badge text in English', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    state.lang = 'en'
    render(<SiteFooter now={ADS_BADGE_BEFORE} />)
    expect(screen.getByTestId('ads-new-badge').textContent).toBe('New')
  })

  it('hides the badge after the cutoff but keeps the link', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    render(<SiteFooter now={ADS_BADGE_AFTER} />)
    expect(screen.queryByTestId('ads-new-badge')).toBeNull()
    expect(screen.getByRole('link', { name: /GLOVAL Ads/ }).getAttribute('href')).toBe('/ads')
  })

  it('renders neither the link nor the badge when the flag is off', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '')
    render(<SiteFooter now={ADS_BADGE_BEFORE} />)
    expect(screen.queryByRole('link', { name: /GLOVAL Ads/ })).toBeNull()
    expect(screen.queryByTestId('ads-new-badge')).toBeNull()
  })

  it('does not change the domain badge expiry', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    render(<SiteFooter now={new Date('2026-12-29T12:00:00+03:00')} />)
    expect(screen.queryByTestId('domain-new-badge')).toBeNull()
    expect(screen.getByTestId('ads-new-badge')).toBeTruthy()
  })
})

describe('isAdsLinkNewBadgeActive', () => {
  it('is on before and at the cutoff, off right after', () => {
    expect(isAdsLinkNewBadgeActive(ADS_BADGE_BEFORE)).toBe(true)
    expect(isAdsLinkNewBadgeActive(new Date(ADS_LINK_NEW_UNTIL))).toBe(true)
    expect(isAdsLinkNewBadgeActive(ADS_BADGE_AFTER)).toBe(false)
  })

  it('expires 60 days after 2026-10-30 and leaves the domain cutoff untouched', () => {
    const start = Date.parse('2026-10-30T00:00:00+03:00')
    const sixtyDays = 60 * 24 * 60 * 60 * 1000
    expect(Date.parse(ADS_LINK_NEW_UNTIL)).toBe(start + sixtyDays + (24 * 60 * 60 * 1000 - 1000))
    expect(DOMAIN_LINK_NEW_UNTIL).toBe('2026-12-28T23:59:59+03:00')
  })
})

describe('footer domain link', () => {
  it('shows the new Turkish label and keeps the target', () => {
    render(<SiteFooter now={BEFORE} />)
    const link = screen.getByRole('link', { name: /Domain Sorgula ve Satın Al/ })
    expect(link.getAttribute('href')).toBe('/alan-adi-sorgula')
    expect(link.className).toContain('text-violet-300')
    expect(link.className).toContain('font-medium')
    expect(link.querySelector('svg')).not.toBeNull()
  })

  it('shows the "Yeni" badge before the cutoff date', () => {
    render(<SiteFooter now={BEFORE} />)
    expect(screen.getByTestId('domain-new-badge').textContent).toBe('Yeni')
  })

  it('hides the badge after the cutoff date', () => {
    render(<SiteFooter now={AFTER} />)
    expect(screen.queryByTestId('domain-new-badge')).toBeNull()
    expect(screen.getByRole('link', { name: 'Domain Sorgula ve Satın Al' })).toBeTruthy()
  })

  it('does not change the other product links', () => {
    render(<SiteFooter now={BEFORE} />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    const productHrefs = hrefs.filter((h) => h?.startsWith('/#') || h === '/alan-adi-sorgula')
    expect(productHrefs).toEqual(['/#features', '/#pricing', '/#showcase', '/alan-adi-sorgula'])
  })
})

describe('isDomainLinkNewBadgeActive', () => {
  it('is on before and at the cutoff, off right after', () => {
    expect(isDomainLinkNewBadgeActive(BEFORE)).toBe(true)
    expect(isDomainLinkNewBadgeActive(new Date(DOMAIN_LINK_NEW_UNTIL))).toBe(true)
    expect(isDomainLinkNewBadgeActive(AFTER)).toBe(false)
  })
})

describe('domain link copy in every locale', () => {
  it('has a clean footerLink and footerBadgeNew for all 12 locales', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(12)
    for (const locale of SUPPORTED_LOCALES) {
      const copy = dictionary[locale].domainSearch
      for (const value of [copy.footerLink, copy.footerBadgeNew]) {
        expect(typeof value, locale).toBe('string')
        expect(value.trim().length, locale).toBeGreaterThan(0)
        expect(value.includes('\uFFFD'), locale).toBe(false)
      }
    }
  })

  it('translates the label and badge outside tr/en', () => {
    const en = dictionary.en.domainSearch
    expect(en.footerLink).toBe('Search & Buy Domains')
    expect(en.footerBadgeNew).toBe('New')
    for (const locale of SUPPORTED_LOCALES) {
      if (locale === 'tr' || locale === 'en') continue
      expect(dictionary[locale].domainSearch.footerLink, locale).not.toBe(en.footerLink)
      expect(dictionary[locale].domainSearch.footerBadgeNew, locale).not.toBe(en.footerBadgeNew)
    }
  })
})
