// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { Pricing } from '@/components/pricing'
import { LANG_COOKIE, type Lang } from '@/lib/i18n'

const originalMatchMedia = window.matchMedia

const localizedCopy: Array<{
  lang: Lang
  title: string
  body: string
  cta: string
  message: string
}> = [
  {
    lang: 'tr',
    title: 'GLOVAL AI Jet Hızında',
    body: 'Siteni kendin yapmak istemiyor musun? İşini ve beğendiğin birkaç siteyi örneklerle bize göster, işine en uygun hâle biz getirelim.',
    cta: 'Teklif iste',
    message: 'İşim: ... / Beğendiğim siteler (en fazla 3 bağlantı): ... / Notlar: ...',
  },
  {
    lang: 'en',
    title: 'GLOVAL AI at Jet Speed',
    body: 'Don’t want to build your website yourself? Show us your business and a few websites you like, and we’ll tailor it to fit your needs.',
    cta: 'Request a quote',
    message: 'My business: ... / Websites I like (up to 3 links): ... / Notes: ...',
  },
  {
    lang: 'de',
    title: 'GLOVAL AI in Jet-Geschwindigkeit',
    body: 'Sie möchten Ihre Website nicht selbst erstellen? Zeigen Sie uns, was Ihr Unternehmen ausmacht, und einige Websites, die Ihnen gefallen – wir gestalten eine passende Website für Sie.',
    cta: 'Angebot anfordern',
    message: 'Mein Unternehmen: ... / Websites, die mir gefallen (max. 3 Links): ... / Hinweise: ...',
  },
  {
    lang: 'fr',
    title: 'GLOVAL AI à la vitesse du jet',
    body: 'Vous ne souhaitez pas créer votre site vous-même ? Présentez-nous votre activité et quelques sites qui vous plaisent ; nous adapterons votre site à vos besoins.',
    cta: 'Demander un devis',
    message: 'Mon activité : ... / Sites qui me plaisent (3 liens maximum) : ... / Remarques : ...',
  },
  {
    lang: 'es',
    title: 'GLOVAL AI a velocidad de jet',
    body: '¿No quieres crear tu sitio web por tu cuenta? Cuéntanos a qué te dedicas y muéstranos algunos sitios que te gustan; adaptaremos el sitio a lo que mejor funcione para tu negocio.',
    cta: 'Solicitar presupuesto',
    message: 'Mi negocio: ... / Sitios que me gustan (máximo 3 enlaces): ... / Notas: ...',
  },
  {
    lang: 'it',
    title: 'GLOVAL AI alla velocità del jet',
    body: 'Non vuoi creare il tuo sito da solo? Raccontaci della tua attività e mostraci alcuni siti che ti piacciono: adatteremo il tuo sito alle tue esigenze.',
    cta: 'Richiedi un preventivo',
    message: 'La mia attività: ... / Siti che mi piacciono (massimo 3 link): ... / Note: ...',
  },
]

function renderPricing(lang: Lang) {
  window.localStorage.clear()
  document.cookie = `${LANG_COOKIE}=; path=/; max-age=0; samesite=lax`
  return render(
    <LanguageProvider initialLang={lang}>
      <Pricing />
    </LanguageProvider>,
  )
}

beforeEach(() => {
  window.matchMedia = ((media: string) =>
    ({
      matches: true,
      media,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as MediaQueryList) as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  window.matchMedia = originalMatchMedia
})

describe('pricing jet band', () => {
  it('is visible immediately below the unchanged four-plan grid', () => {
    renderPricing('tr')

    const band = screen.getByRole('region', { name: 'GLOVAL AI Jet Hızında' })
    const grid = band.previousElementSibling as HTMLDivElement | null

    expect(band.textContent).toContain(
      'Siteni kendin yapmak istemiyor musun? İşini ve beğendiğin birkaç siteyi örneklerle bize göster, işine en uygun hâle biz getirelim.',
    )
    expect(band.className).toContain('flex-col')
    expect(band.className).toContain('md:flex-row')
    expect(grid?.className).toContain('md:grid-cols-2')
    expect(grid?.className).toContain('xl:grid-cols-4')
    expect(
      grid ? Array.from(grid.children, (card) => (card as HTMLElement).id) : [],
    ).toEqual(['plan-free', 'plan-starter', 'plan-pro', 'plan-ecommerce'])
  })

  it('links to a prefilled technical website request with the exact Turkish template', () => {
    renderPricing('tr')

    const link = screen.getByRole('link', { name: 'Teklif iste' })
    const href = link.getAttribute('href')
    expect(href).not.toBeNull()

    const url = new URL(href ?? '', 'https://gloval.ai')
    expect(url.pathname).toBe('/support/new')
    expect(url.searchParams.get('department')).toBe('technical')
    expect(url.searchParams.get('service')).toBe('website')
    expect(url.searchParams.get('message')).toBe(
      'İşim: ... / Beğendiğim siteler (en fazla 3 bağlantı): ... / Notlar: ...',
    )
  })

  it.each(localizedCopy)(
    'uses the $lang translation and localized ticket template',
    ({ lang, title, body, cta, message }) => {
      renderPricing(lang)

      const band = screen.getByRole('region', { name: title })
      const link = screen.getByRole('link', { name: cta })
      const href = link.getAttribute('href')
      expect(href).not.toBeNull()
      expect(band.textContent).toContain(body)

      const url = new URL(href ?? '', 'https://gloval.ai')
      expect(url.pathname).toBe('/support/new')
      expect(url.searchParams.get('message')).toBe(message)
    },
  )
})
