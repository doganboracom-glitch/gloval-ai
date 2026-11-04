// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { Pricing } from '@/components/pricing'
import { LANG_COOKIE, type Lang } from '@/lib/i18n'
import { PLANS, planPrice } from '@/lib/pricing-config'

const originalMatchMedia = window.matchMedia

const localizedCopy: Array<{
  lang: Lang
  title: string
  subtitle: string
  body: string
  cta: string
  guestMessage: string
  supportMessage: string
}> = [
  {
    lang: 'tr',
    title: 'GLOVAL Maker',
    subtitle: 'Siteni biz yapalım.',
    body: 'İşini ve beğendiğin birkaç siteyi bize göster, senin yerine hızlıca hazırlayalım.',
    cta: 'Teklif iste',
    guestMessage: 'Web sitesi yaptırmak istiyorum. Telefonum: ',
    supportMessage: 'İşim: ... / Beğendiğim siteler (en fazla 3 bağlantı): ... / Notlar: ...',
  },
  {
    lang: 'en',
    title: 'GLOVAL Maker',
    subtitle: 'Let us build your website.',
    body: 'Show us what your business does and a few websites you like, and we’ll quickly build it for you.',
    cta: 'Request a quote',
    guestMessage: 'I’d like to have a website made. My phone number: ',
    supportMessage: 'My business: ... / Websites I like (up to 3 links): ... / Notes: ...',
  },
  {
    lang: 'de',
    title: 'GLOVAL Maker',
    subtitle: 'Wir erstellen Ihre Website.',
    body: 'Zeigen Sie uns, was Ihr Unternehmen ausmacht, und einige Websites, die Ihnen gefallen; wir erstellen schnell eine passende Website für Sie.',
    cta: 'Angebot anfordern',
    guestMessage: 'Ich möchte eine Website erstellen lassen. Meine Telefonnummer: ',
    supportMessage: 'Mein Unternehmen: ... / Websites, die mir gefallen (max. 3 Links): ... / Hinweise: ...',
  },
  {
    lang: 'fr',
    title: 'GLOVAL Maker',
    subtitle: 'Confiez-nous la création de votre site.',
    body: 'Montrez-nous votre activité et quelques sites que vous aimez ; nous préparerons rapidement votre site à votre place.',
    cta: 'Demander un devis',
    guestMessage: 'Je souhaite faire créer un site web. Mon téléphone : ',
    supportMessage: 'Mon activité : ... / Sites qui me plaisent (3 liens maximum) : ... / Remarques : ...',
  },
  {
    lang: 'es',
    title: 'GLOVAL Maker',
    subtitle: 'Creamos tu sitio web.',
    body: 'Muéstranos a qué se dedica tu negocio y algunos sitios que te gustan; prepararemos rápidamente uno por ti.',
    cta: 'Solicitar presupuesto',
    guestMessage: 'Quiero encargar un sitio web. Mi teléfono: ',
    supportMessage: 'Mi negocio: ... / Sitios que me gustan (máximo 3 enlaces): ... / Notas: ...',
  },
  {
    lang: 'it',
    title: 'GLOVAL Maker',
    subtitle: 'Creiamo il tuo sito web.',
    body: 'Raccontaci della tua attività e mostraci alcuni siti che ti piacciono: ne prepareremo uno per te in modo rapido.',
    cta: 'Richiedi un preventivo',
    guestMessage: 'Vorrei commissionare un sito web. Il mio telefono: ',
    supportMessage: 'La mia attività: ... / Siti che mi piacciono (massimo 3 link): ... / Note: ...',
  },
]

function renderPricing(lang: Lang, isAuthenticated = false, makerRequestsEnabled = false) {
  window.localStorage.clear()
  document.cookie = `${LANG_COOKIE}=; path=/; max-age=0; samesite=lax`
  return render(
    <LanguageProvider initialLang={lang}>
      <Pricing isAuthenticated={isAuthenticated} makerRequestsEnabled={makerRequestsEnabled} />
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
  vi.unstubAllGlobals()
  window.matchMedia = originalMatchMedia
})

describe('pricing Maker band', () => {
  it('is visible immediately below the unchanged four-plan grid', () => {
    renderPricing('tr')

    const band = screen.getByRole('region', { name: 'GLOVAL Maker' })
    const grid = band.previousElementSibling as HTMLDivElement | null

    expect(band.textContent).toContain('Siteni biz yapalım.')
    expect(band.textContent).toContain(
      'İşini ve beğendiğin birkaç siteyi bize göster, senin yerine hızlıca hazırlayalım.',
    )
    expect(band.className).toContain('flex-col')
    expect(band.className).toContain('md:flex-row')
    expect(grid?.className).toContain('md:grid-cols-2')
    expect(grid?.className).toContain('xl:grid-cols-4')
    expect(
      grid ? Array.from(grid.children, (card) => (card as HTMLElement).id) : [],
    ).toEqual(['plan-free', 'plan-starter', 'plan-pro', 'plan-ecommerce'])
  })

  it('routes guests to the public contact form with the phone prompt', () => {
    renderPricing('tr')

    const link = screen.getByRole('link', { name: 'Teklif iste' })
    const url = new URL(link.getAttribute('href') ?? '', 'https://gloval.ai')

    expect(url.pathname).toBe('/iletisim')
    expect(Array.from(url.searchParams.keys())).toEqual(['message'])
    expect(url.searchParams.get('message')).toBe(
      'Web sitesi yaptırmak istiyorum. Telefonum: ',
    )
  })

  it('keeps the existing technical support prefill for authenticated users', () => {
    renderPricing('tr', true)

    const link = screen.getByRole('link', { name: 'Teklif iste' })
    const url = new URL(link.getAttribute('href') ?? '', 'https://gloval.ai')

    expect(url.pathname).toBe('/support/new')
    expect(url.searchParams.get('department')).toBe('technical')
    expect(url.searchParams.get('service')).toBe('website')
    expect(url.searchParams.get('message')).toBe(
      'İşim: ... / Beğendiğim siteler (en fazla 3 bağlantı): ... / Notlar: ...',
    )
  })

  it.each(localizedCopy)(
    'uses the $lang Maker copy and guest prefill',
    ({ lang, title, subtitle, body, cta, guestMessage }) => {
      renderPricing(lang)

      const band = screen.getByRole('region', { name: title })
      const link = screen.getByRole('link', { name: cta })
      const url = new URL(link.getAttribute('href') ?? '', 'https://gloval.ai')

      expect(band.textContent).toContain(subtitle)
      expect(band.textContent).toContain(body)
      expect(url.pathname).toBe('/iletisim')
      expect(url.searchParams.get('message')).toBe(guestMessage)
    },
  )

  it.each([
    { lang: 'tr' as const, trigger: 'Teklif iste', title: 'Web siten için teklif iste' },
    { lang: 'en' as const, trigger: 'Request a quote', title: 'Get a website quote' },
  ])('opens the enabled request dialog in $lang', async ({ lang, trigger, title }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ prefill: null }),
    }))
    renderPricing(lang, false, true)

    fireEvent.click(screen.getByRole('button', { name: trigger }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(within(dialog).getByRole('heading', { name: title })).toBeTruthy()
    expect(within(dialog).getByLabelText(lang === 'tr' ? 'Ad soyad' : 'Full name')).toBeTruthy()
    expect(within(dialog).getByLabelText(lang === 'tr' ? 'Telefon' : 'Phone')).toBeTruthy()
    expect(within(dialog).getByLabelText(lang === 'tr' ? 'E-posta' : 'Email')).toBeTruthy()
  })

  it.each([
    {
      lang: 'tr' as const,
      trigger: 'Teklif iste',
      name: 'Ad soyad',
      phone: 'Telefon',
      email: 'E-posta',
      budget: 'Yaklaşık bütçe',
      submit: 'Teklif isteğini gönder',
      success: 'Talebini aldık',
    },
    {
      lang: 'en' as const,
      trigger: 'Request a quote',
      name: 'Full name',
      phone: 'Phone',
      email: 'Email',
      budget: 'Approximate budget',
      submit: 'Send quote request',
      success: 'We got your request',
    },
  ])('shows the localized success state in $lang', async (copy) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ prefill: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    renderPricing(copy.lang, false, true)

    fireEvent.click(screen.getByRole('button', { name: copy.trigger }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(copy.name), { target: { value: 'Derya Yılmaz' } })
    fireEvent.change(within(dialog).getByLabelText(copy.phone), { target: { value: '+90 555 123 45 67' } })
    fireEvent.change(within(dialog).getByLabelText(copy.email), { target: { value: 'derya@example.net' } })
    fireEvent.change(within(dialog).getByLabelText(copy.budget), { target: { value: '10000-25000' } })
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByRole('button', { name: copy.submit }))

    expect(await within(dialog).findByRole('heading', { name: copy.success })).toBeTruthy()
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/maker-requests', expect.objectContaining({ method: 'POST' }))
  })
})

describe('responsive plan-card pricing', () => {
  it.each([
    { lang: 'tr' as const, cycle: 'monthly' as const, period: '/ ay', domainGift: null },
    { lang: 'tr' as const, cycle: 'yearly' as const, period: '/ yıl', domainGift: '.com.tr alan adı hediye' },
    { lang: 'en' as const, cycle: 'monthly' as const, period: '/ month', domainGift: null },
    { lang: 'en' as const, cycle: 'yearly' as const, period: '/ year', domainGift: 'Free .com.tr domain' },
  ])('keeps the $lang $cycle price and feature controls usable', ({ lang, cycle, period, domainGift }) => {
    renderPricing(lang)
    fireEvent.click(screen.getByRole('tab', { name: cycle === 'yearly' ? 'Yıllık' : 'Aylık' }))

    const ecommercePlan = PLANS.find((plan) => plan.code === 'ecommerce')
    const card = document.getElementById('plan-ecommerce')
    if (!ecommercePlan || !card) throw new Error('E-commerce plan card is missing')

    expect(card.className).toContain('flex-col')
    expect(card.className).toContain('min-w-0')
    expect(card.className).not.toContain('overflow-hidden')

    const price = within(card).getByText(planPrice(ecommercePlan, cycle).price, { exact: true })
    expect(price.className).toContain('whitespace-nowrap')
    expect(price.className).toContain('tabular-nums')
    expect(within(card).getByText(period, { exact: true }).className).toContain('whitespace-nowrap')

    if (domainGift) {
      const domain = within(card).getByText(domainGift, { exact: true })
      const notes = domain.parentElement
      const saving = domain.previousElementSibling as HTMLParagraphElement | null

      expect(domain.className).toContain('whitespace-nowrap')
      expect(notes?.className).toContain('flex-col')
      expect(notes?.className).toContain('gap-1.5')
      expect(notes?.className).toContain('min-h-11')
      expect(saving?.tagName).toBe('P')
      expect(saving?.className).toContain('leading-relaxed')
      expect(saving?.className).not.toContain('h-5')
    }

    const showAll = within(card).getByRole('button', {
      name: lang === 'tr' ? 'Tüm özellikleri göster' : 'Show all features',
    })
    expect(showAll.parentElement?.className).toContain('mt-auto')
    fireEvent.click(showAll)
    expect(showAll.getAttribute('aria-expanded')).toBe('true')
  })
})
