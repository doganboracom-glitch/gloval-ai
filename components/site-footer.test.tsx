// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SiteFooter } from './site-footer'
import { dictionary, type Lang } from '@/lib/i18n'
import { SUPPORTED_LOCALES } from '@/lib/locale-registry'
import { DOMAIN_LINK_NEW_UNTIL, isDomainLinkNewBadgeActive } from '@/lib/footer-new-badge'

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
const PRODUCT_TITLES: Record<Lang, string> = {
  tr: 'Ürünler',
  en: 'Products',
  ar: 'المنتجات',
  az: 'Məhsullar',
  de: 'Produkte',
  es: 'Productos',
  et: 'Tooted',
  fr: 'Produits',
  it: 'Prodotti',
  pl: 'Produkty',
  pt: 'Produtos',
  ru: 'Продукты',
}

const PARTNER_COPY = [
  ['tr', 'Web sitesi sat, sunucu ve yatırım derdi olmadan kendi markanla kazan.', 'YAKINDA'],
  ['en', 'Sell websites and earn under your own brand, without the hassle of servers or investment.', 'COMING SOON'],
  ['de', 'Verkaufen Sie Websites und verdienen Sie unter Ihrer eigenen Marke – ohne Server oder Investitionskosten.', 'DEMNÄCHST'],
  ['fr', 'Vendez des sites web sous votre propre marque, sans vous soucier des serveurs ni de l’investissement.', 'BIENTÔT'],
  ['es', 'Vende sitios web y gana con tu propia marca, sin preocuparte por servidores ni inversión.', 'PRÓXIMAMENTE'],
  ['it', 'Vendi siti web e guadagna con il tuo marchio, senza preoccuparti di server o investimenti.', 'PROSSIMAMENTE'],
] as const

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_REFERRAL_ENABLED', '1')
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  state.lang = 'tr'
})

describe('GLOVAL Partner footer card', () => {
  it('renders the teaser and badge without link or hover affordances', () => {
    render(<SiteFooter now={BEFORE} />)
    const card = screen.getByTestId('partner-footer-block')

    expect(card.tagName).toBe('DIV')
    expect(card.getAttribute('role')).toBe('group')
    expect(within(card).getByRole('heading', { name: 'GLOVAL Partner' })).toBeTruthy()
    expect(
      within(card).getByText('Web sitesi sat, sunucu ve yatırım derdi olmadan kendi markanla kazan.'),
    ).toBeTruthy()
    expect(within(card).getByTestId('partner-soon-badge').textContent).toBe('YAKINDA')
    expect(card.querySelector('a, button, [tabindex]')).toBeNull()
    expect(card.querySelector('[class*="cursor-"]')).toBeNull()
    expect(card.className).not.toMatch(/hover:/)
  })

  it('sits below the brand tagline and preserves four footer columns', () => {
    render(<SiteFooter now={BEFORE} />)
    const card = screen.getByTestId('partner-footer-block')
    const brandColumn = screen.getByTestId('footer-brand-column')
    const tagline = within(brandColumn).getByText(dictionary.tr.footer.tagline)
    const grid = brandColumn.parentElement

    expect(brandColumn.contains(card)).toBe(true)
    expect(tagline.nextElementSibling).toBe(card)
    expect(grid?.children.length).toBe(4)
    expect(grid?.className).toContain('lg:grid-cols-4')
    expect(grid?.className).not.toContain('lg:grid-cols-5')
  })

  it.each(PARTNER_COPY)('renders the %s translation', (locale, description, badge) => {
    state.lang = locale
    render(<SiteFooter now={BEFORE} />)
    const card = screen.getByTestId('partner-footer-block')

    expect(within(card).getByRole('heading', { name: 'GLOVAL Partner' })).toBeTruthy()
    expect(within(card).getByText(description)).toBeTruthy()
    expect(within(card).getByTestId('partner-soon-badge').textContent).toBe(badge)
  })
})

describe('footer GLOVAL Ads link badge', () => {
  it('shows the "Yeni" badge next to the link when the flag is on', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    render(<SiteFooter now={BEFORE} />)
    const link = screen.getByRole('link', { name: /GLOVAL Ads/ })
    expect(link.getAttribute('href')).toBe('/ads')
    expect(link.contains(screen.getByTestId('ads-soon-badge'))).toBe(true)
    expect(screen.getByTestId('ads-soon-badge').textContent).toBe('Yeni')
    expect(screen.queryByTestId('ads-new-badge')).toBeNull()
  })

  it('uses the uppercase brand style for the new badge', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    render(<SiteFooter now={BEFORE} />)
    const badgeClassName = screen.getByTestId('ads-soon-badge').className
    expect(badgeClassName).toContain('uppercase')
    expect(badgeClassName).toContain('border-brand/40')
    expect(badgeClassName).toContain('text-brand')
  })

  it('shows the English new badge text in English', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    state.lang = 'en'
    render(<SiteFooter now={BEFORE} />)
    expect(screen.getByTestId('ads-soon-badge').textContent).toBe('New')
  })

  it('keeps the badge long after the domain badge has expired', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    render(<SiteFooter now={AFTER} />)
    expect(screen.queryByTestId('domain-new-badge')).toBeNull()
    expect(screen.getByTestId('ads-soon-badge')).toBeTruthy()
  })

  it('renders neither the link nor the badge when the flag is off', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '')
    render(<SiteFooter now={BEFORE} />)
    expect(screen.queryByRole('link', { name: /GLOVAL Ads/ })).toBeNull()
    expect(screen.queryByTestId('ads-soon-badge')).toBeNull()
  })

  it('leaves the domain cutoff untouched', () => {
    expect(DOMAIN_LINK_NEW_UNTIL).toBe('2026-12-28T23:59:59+03:00')
  })
})

describe('referral terms footer link', () => {
  it.each(SUPPORTED_LOCALES)('links to the terms in %s', (locale) => {
    state.lang = locale
    render(<SiteFooter now={BEFORE} />)
    const label = dictionary[locale].footer.links.referralTerms
    const link = screen.getByRole('link', { name: label })

    expect(label.trim()).not.toBe('')
    expect(label.includes('\uFFFD')).toBe(false)
    if (locale === 'tr') expect(label).toBe('Satış Ortaklığı Şartları')
    expect(link.getAttribute('href')).toBe('/yasal/satis-ortakligi-sartlari')
  })

  it('hides the link while the referral program is disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_REFERRAL_ENABLED', '0')
    render(<SiteFooter now={BEFORE} />)
    expect(screen.queryByRole('link', { name: dictionary.tr.footer.links.referralTerms })).toBeNull()
  })
})

describe('footer domain link', () => {
  it('shows the new Turkish label with the same link styling as the other footer links', () => {
    render(<SiteFooter now={BEFORE} />)
    const link = screen.getByRole('link', { name: /Domain Sorgula ve Satın Al/ })
    const regularLink = screen.getAllByRole('link').find((item) => item.getAttribute('href') === '/yasal/hakkimizda')
    expect(link.getAttribute('href')).toBe('/alan-adi-sorgula')
    expect(regularLink).toBeDefined()
    expect(link.className).toBe(regularLink?.className)
    expect(link.querySelector('svg')).toBeNull()
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

  it('keeps only Domain, WHOIS, and Ads in the product column', () => {
    vi.stubEnv('NEXT_PUBLIC_WHOIS_LOOKUP_ENABLED', '1')
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    render(<SiteFooter now={BEFORE} />)

    const productColumn = screen.getByRole('heading', { name: 'Ürünler' }).parentElement as HTMLElement
    const productLinks = within(productColumn).getAllByRole('link')

    expect(productLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/alan-adi-sorgula',
      '/whois',
      '/ads',
    ])
    expect(within(productColumn).queryByRole('link', { name: /Özellikler/ })).toBeNull()
    expect(within(productColumn).queryByRole('link', { name: /Fiyatlar/ })).toBeNull()
    expect(within(productColumn).queryByRole('link', { name: /Örnekler/ })).toBeNull()
    expect(within(productColumn).getByRole('link', { name: /Domain Sorgula ve Satın Al/ })).toBeTruthy()
    expect(within(productColumn).getByRole('link', { name: /WHOIS Sorgula/ })).toBeTruthy()
    expect(within(productColumn).getByRole('link', { name: /GLOVAL Ads/ })).toBeTruthy()
  })

  it.each(SUPPORTED_LOCALES)('renders the plural product heading for %s', (locale) => {
    state.lang = locale
    render(<SiteFooter now={BEFORE} />)
    const expectedHeading = PRODUCT_TITLES[locale]

    expect(dictionary[locale].footer.product).toBe(expectedHeading)
    expect(screen.getByRole('heading', { name: expectedHeading })).toBeTruthy()
  })

  it('keeps footer link keys aligned and removes the unused section keys', () => {
    const expectedKeys = Object.keys(dictionary.en.footer.links).sort()

    for (const locale of SUPPORTED_LOCALES) {
      const localeKeys = Object.keys(dictionary[locale].footer.links).sort()
      expect(localeKeys, locale).toEqual(expectedKeys)
      expect(localeKeys, locale).not.toContain('features')
      expect(localeKeys, locale).not.toContain('pricing')
      expect(localeKeys, locale).not.toContain('showcase')
    }
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
