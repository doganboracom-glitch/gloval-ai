// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { AdsPlatformGrid } from '@/components/ads/ads-platform-grid'
import { AdsCreditsSection } from '@/components/ads/sections/ads-credits-section'
import { AdsExamplePreviewSection } from '@/components/ads/sections/ads-example-preview'
import { AdsFaqSection } from '@/components/ads/sections/ads-faq-section'
import { AdsHowItWorksSection } from '@/components/ads/sections/ads-how-it-works'
import { ADS_CREDIT_COSTS } from '@/lib/ads/credit-costs'
import { adsSectionsCopy } from '@/lib/ads/ads-sections-copy'
import { LANG_COOKIE } from '@/lib/i18n'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

function renderWithLanguage(lang: 'tr' | 'en', children: ReactNode) {
  return render(<LanguageProvider initialLang={lang}>{children}</LanguageProvider>)
}

beforeEach(() => {
  window.localStorage.clear()
  document.cookie = `${LANG_COOKIE}=; path=/; max-age=0; samesite=lax`
})

afterEach(cleanup)

describe('Ads example preview', () => {
  it('renders the Turkish sample ad and all generated-plan callouts without prohibited claims', () => {
    renderWithLanguage('tr', <AdsExamplePreviewSection />)

    const section = screen.getByRole('region', { name: 'Dakikalar içinde siteden reklam planına' })
    const sectionText = section.textContent ?? ''

    expect(screen.getByRole('article', { name: 'Örnek' })).toBeTruthy()
    expect(sectionText).toContain('Sponsorlu')
    expect(sectionText).toContain('ornek-klima-servisi.test')
    expect(sectionText).toContain('Bu bir örnek tasarımdır; reklam yayınlanmış değildir.')
    expect(sectionText).toContain('Örnek günlük bütçe')
    expect(sectionText).toContain('₺300 / gün')

    for (const callout of adsSectionsCopy.tr.preview.callouts) {
      expect(sectionText).toContain(callout)
    }

    expect(sectionText).not.toMatch(/(?:^|[^\p{L}\p{N}])(?:yaş|cinsiyet|garanti)(?=$|[^\p{L}\p{N}])/iu)
    expect(adsSectionsCopy.tr.preview.headlineOne.length).toBeLessThanOrEqual(30)
    expect(adsSectionsCopy.tr.preview.headlineTwo.length).toBeLessThanOrEqual(30)
    expect(adsSectionsCopy.tr.preview.description.length).toBeLessThanOrEqual(90)
  })

  it('renders the English plan callouts without age, gender, or guarantee claims', () => {
    renderWithLanguage('en', <AdsExamplePreviewSection />)

    const section = screen.getByRole('region', { name: 'From website to ad plan in minutes' })
    const sectionText = section.textContent ?? ''

    expect(screen.getByRole('article', { name: 'Sample' })).toBeTruthy()
    for (const callout of adsSectionsCopy.en.preview.callouts) {
      expect(sectionText).toContain(callout)
    }
    expect(sectionText).not.toMatch(
      /(?:^|[^\p{L}\p{N}])(?:age|gender|guarantee(?:d)?)(?=$|[^\p{L}\p{N}])/iu,
    )
    expect(adsSectionsCopy.en.preview.headlineOne.length).toBeLessThanOrEqual(30)
    expect(adsSectionsCopy.en.preview.headlineTwo.length).toBeLessThanOrEqual(30)
    expect(adsSectionsCopy.en.preview.description.length).toBeLessThanOrEqual(90)
  })
})

describe('Ads credits panel', () => {
  it('keeps the tax and balance notes attached to the table and links to billing', () => {
    renderWithLanguage('tr', <AdsCreditsSection />)

    const panel = screen.getByRole('complementary', { name: 'Kredi bilgileri' })
    const table = screen.getByRole('table')
    const billingLink = screen.getByRole('link', { name: 'Kredi al' })

    const tableFrame = table.parentElement
    const panelClasses = panel.className.split(/\s+/)

    expect(tableFrame?.nextElementSibling).toBe(panel)
    expect(tableFrame?.className.split(/\s+/)).toEqual(expect.arrayContaining(['border', 'border-border']))
    expect(panelClasses).toEqual(
      expect.arrayContaining([
        '-mt-px',
        'w-full',
        'rounded-2xl',
        'border',
        'border-border',
        'sm:mx-auto',
        'sm:w-2/3',
      ]),
    )
    expect(panelClasses).not.toContain('sm:ml-auto')
    expect(panel.textContent).toContain('Kredi satın alımında ve plan fiyatlarında KDV dahildir.')
    expect(panel.textContent).toContain('Krediler mevcut AI kredi bakiyenle aynıdır.')
    expect(billingLink.getAttribute('href')).toBe('/billing')
    expect(table.textContent).toContain(String(ADS_CREDIT_COSTS.scanAndPreview))
    expect(table.textContent).toContain(String(ADS_CREDIT_COSTS.publish))
  })
})

describe('Ads platform and information sections', () => {
  it('renders six channels with only Google Ads active and includes WhatsApp Ads', () => {
    renderWithLanguage('tr', <AdsPlatformGrid />)

    const cards = screen.getAllByRole('listitem')
    expect(cards).toHaveLength(6)
    expect(cards[0]?.textContent).toContain('Google Ads')
    expect(cards[0]?.textContent).not.toContain('Yakında')
    expect(cards.slice(1).every((card) => card.textContent?.includes('Yakında'))).toBe(true)
    expect(cards.every((card) => card.querySelector('svg'))).toBe(true)
    expect(cards[5]?.textContent).toContain('WhatsApp')
    expect(cards[5]?.textContent).toContain('WhatsApp Business reklamlarıyla sohbet başlatan kampanyalar.')
  })

  it('uses three step cards while preserving all existing step copy', () => {
    renderWithLanguage('tr', <AdsHowItWorksSection />)

    const section = screen.getByRole('region', { name: 'Nasıl çalışır?' })
    expect(screen.getAllByRole('listitem')).toHaveLength(3)

    for (const step of adsSectionsCopy.tr.how.steps) {
      expect(section.textContent).toContain(step.title)
      expect(section.textContent).toContain(step.body)
    }
  })

  it('groups the FAQ support callout at the list width and links to the contact page', () => {
    renderWithLanguage('tr', <AdsFaqSection />)

    const supportText = screen.getByText('Sorunuz mu var? Destek ekibimiz size yardımcı olabilir.')
    const supportLink = screen.getByRole('link', { name: 'Destek ekibine ulaşın' })
    const supportRow = supportText.parentElement
    const supportRowClasses = supportRow?.className.split(/\s+/) ?? []

    expect(supportRow?.tagName).toBe('ASIDE')
    expect(supportLink.parentElement).toBe(supportRow)
    expect(supportRowClasses).toEqual(
      expect.arrayContaining([
        'mx-auto',
        'w-full',
        'max-w-3xl',
        'flex-col',
        'items-center',
        'gap-4',
        'text-center',
        'sm:flex-row',
        'sm:justify-center',
      ]),
    )
    expect(supportLink.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['border', 'border-border/70']),
    )
    expect(supportLink.getAttribute('href')).toBe('/support/new?department=gloval-ads')
  })
})
