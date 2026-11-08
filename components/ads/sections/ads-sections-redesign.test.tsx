// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { AdsPlatformGrid } from '@/components/ads/ads-platform-grid'
import { AdsPlatformSelector } from '@/components/ads/ads-platform-selector'
import { AdsCreditsSection } from '@/components/ads/sections/ads-credits-section'
import { AdsExamplePreviewSection } from '@/components/ads/sections/ads-example-preview'
import { AdsFaqSection } from '@/components/ads/sections/ads-faq-section'
import { AdsHowItWorksSection } from '@/components/ads/sections/ads-how-it-works'
import { ADS_CREDIT_COSTS } from '@/lib/ads/credit-costs'
import { adsSectionsCopy } from '@/lib/ads/ads-sections-copy'
import { dictionary, LANG_COOKIE } from '@/lib/i18n'

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
    expect(table.textContent).toContain(adsSectionsCopy.tr.credits.publishTitle)
    expect(table.textContent).toContain(adsSectionsCopy.tr.credits.publishStatus)
    expect(table.textContent).toContain(adsSectionsCopy.tr.credits.comingSoon)
  })
})

describe('Ads platform and information sections', () => {
  it('keeps Google sign-in and shows a focusable, passive Meta approval button', () => {
    renderWithLanguage('tr', <AdsPlatformGrid />)

    const cards = screen.getAllByRole('listitem')
    const pendingButton = screen.getByTestId('meta-approval-pending-button') as HTMLButtonElement
    expect(cards).toHaveLength(6)
    expect(cards[0]?.textContent).toContain('Google Ads')
    expect(cards[0]?.textContent).toContain('Giriş yap ve başla')
    expect(cards[0]?.textContent).not.toContain('Yakında')
    expect(cards[0]?.querySelector('a')).not.toBeNull()
    expect(cards[1]?.textContent).toContain('Meta onayı bekleniyor')
    expect(cards[1]?.textContent).toContain('Facebook ve Instagram reklamları')
    expect(cards[1]?.querySelector('a')).toBeNull()
    expect(pendingButton.getAttribute('aria-disabled')).toBe('true')
    expect(pendingButton.hasAttribute('disabled')).toBe(false)
    expect(pendingButton.tabIndex).toBe(0)
    expect(pendingButton.title).toBe('Meta uygulama incelemesi tamamlanınca açılacak')
    expect(cards.slice(2).every((card) => card.textContent?.includes('Yakında'))).toBe(true)
    expect(cards.every((card) => card.querySelector('svg'))).toBe(true)
    expect(cards[5]?.textContent).toContain('WhatsApp')
    expect(cards[5]?.textContent).toContain('WhatsApp Business reklamlarıyla sohbet başlatan kampanyalar.')
  })

  it('keeps the Meta sign-in CTA active when the server reports open access', () => {
    renderWithLanguage('tr', <AdsPlatformGrid metaPublicAccessOpen />)

    const metaCard = screen.getAllByRole('listitem')[1]
    expect(metaCard?.textContent).toContain('Giriş yap ve başla')
    expect(metaCard?.querySelector('a')).not.toBeNull()
    expect(screen.queryByTestId('meta-approval-pending-button')).toBeNull()
  })

  it('preserves the gated Meta dashboard link for authorized viewers', () => {
    renderWithLanguage('tr', <AdsPlatformGrid viewer={{ authenticated: true, openGates: ['meta_connect'] as const }} />)

    const metaCard = screen.getAllByRole('listitem')[1]
    expect(metaCard?.querySelector('a')?.getAttribute('href')).toBe('/ads/dashboard?platform=meta')
    expect(metaCard?.textContent).toContain('Panele git')
  })

  it('labels inaccessible Meta selection as approval pending in the panel', () => {
    const { container } = render(
      <AdsPlatformSelector
        copy={dictionary.tr.ads}
        activeSlug="google"
        openGates={[]}
        onSelect={() => undefined}
      />,
    )
    const metaOption = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Meta'))

    expect(metaOption?.textContent).toContain('Onay bekleniyor')
    expect(metaOption?.getAttribute('aria-disabled')).toBe('true')
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

  it('groups the FAQ support callout at the list width and opens a prefilled support ticket', () => {
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
