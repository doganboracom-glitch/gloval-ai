import { describe, expect, it } from 'vitest'
import { applyOperation } from '@/lib/website-edit-operations'
import { CANONICAL_KINDS, suggestPageSlug } from '@/lib/canonical-pages'
import { findPublicPage, pageHasContent, sectionsForPage } from '@/lib/website-pages'
import { fallbackWebsite, type Section, type WebsiteSchema } from '@/lib/website-schema'

const sec = (type: string, extra: Record<string, unknown> = {}) =>
  ({
    type,
    title: type,
    items: [
      {
        title: 'x',
        description: 'x',
        name: 'x',
        role: 'x',
        question: 'x',
        answer: 'x',
        quote: 'x',
        author: 'x',
        src: 'https://example.com/x.jpg',
        alt: 'x',
      },
    ],
    members: [{ name: 'x', role: 'x', image: 'https://example.com/x.jpg' }],
    pageEnabled: true,
    detail: { pageEnabled: true },
    ...extra,
  }) as unknown as Section

type PageSpec = { slug: string; title: string; isHome?: boolean; kind?: string; detailOf?: string; own?: string[] }

function site(pages: PageSpec[], homeTypes: string[]): WebsiteSchema {
  const base = fallbackWebsite('test', 'tr')
  return {
    ...base,
    sections: homeTypes.map((t) => sec(t)),
    pages: pages.map(({ own, ...p }) => ({ ...p, ...(own ? { sections: own.map((t) => sec(t)) } : {}) })),
  } as unknown as WebsiteSchema
}

const typesOf = (s: WebsiteSchema, slug: string) =>
  sectionsForPage(s, slug).map((x) => x.type).filter((t) => t !== 'footer')

describe('a page without its own content never shows another page', () => {
  const HOME = ['hero', 'about', 'services', 'faq', 'contact', 'footer']

  it('an unknown page (/faq with no sections) is not served, instead of showing the home page', () => {
    const s = site([{ slug: 'home', title: 'Ana Sayfa', isHome: true }, { slug: 'faq', title: 'Zxq', kind: 'custom', own: [] }], HOME)
    expect(typesOf(s, 'faq')).toEqual([])
    expect(pageHasContent(s, 'faq')).toBe(false)
    expect(findPublicPage(s, 'faq')).toBeNull()
  })

  it('/contact never falls back to FAQ/CTA when there is no contact section', () => {
    const s = site(
      [{ slug: 'home', title: 'Ana Sayfa', isHome: true }, { slug: 'contact', title: 'İletişim', kind: 'custom', own: [] }],
      ['hero', 'faq', 'cta', 'footer'],
    )
    expect(typesOf(s, 'contact')).toEqual([])
    expect(findPublicPage(s, 'contact')).toBeNull()
  })

  it('a page with a matching home section still derives it', () => {
    const s = site([{ slug: 'home', title: 'Ana Sayfa', isHome: true }, { slug: 'iletisim', title: 'İletişim', kind: 'custom', own: [] }], HOME)
    expect(typesOf(s, 'iletisim')).toContain('contact')
    expect(findPublicPage(s, 'iletisim')).not.toBeNull()
  })
})

describe('existing published sites keep every page (no 404)', () => {
  const cases: Array<{ name: string; s: WebsiteSchema }> = [
    {
      name: 'dbajans.com.tr',
      s: site(
        [
          { slug: 'home', title: 'Ana Sayfa', isHome: true, kind: 'home' },
          { slug: 'hakkimizda', title: 'Hakkımızda', kind: 'detail', detailOf: 'about' },
          { slug: 'hizmetlerimiz', title: 'Hizmetlerimiz', kind: 'detail', detailOf: 'services' },
          { slug: 'iletisim', title: 'iletisim', kind: 'custom', own: ['faq', 'cta', 'contact'] },
          { slug: 'referanslar', title: 'Referanslar', kind: 'detail', detailOf: 'references' },
          { slug: 'kadromuz', title: 'Kadromuz', kind: 'detail', detailOf: 'team' },
        ],
        ['announcement', 'hero', 'heroStrip', 'about', 'products', 'stats', 'services', 'team', 'faq', 'blogLatest', 'references', 'testimonials', 'cta', 'contact', 'footer'],
      ),
    },
    {
      name: 'luna-mucevher.gloval.site',
      s: site(
        [
          { slug: 'home', title: 'Anasayfa', isHome: true, kind: 'home' },
          { slug: 'products', title: 'Ürünler', kind: 'custom', own: ['categories', 'features', 'products', 'products', 'cta'] },
        ],
        ['hero', 'categories', 'features', 'products', 'stats', 'products', 'testimonials', 'faq', 'cta', 'contact', 'contact', 'footer'],
      ),
    },
    {
      name: 'ay-yildiz-tasimacilik',
      s: site(
        [
          { slug: 'home', title: 'Ana Sayfa', isHome: true, kind: 'home' },
          { slug: 'about', title: 'Hakkımızda', kind: 'custom', own: ['process'] },
          { slug: 'faq', title: 'S.S.S.', kind: 'custom', own: ['hero', 'features', 'process', 'gallery', 'blogLatest', 'faq', 'cta', 'contact'] },
          { slug: 'contact', title: 'İletişim', kind: 'custom', own: ['faq', 'cta', 'contact'] },
          { slug: 'galeri', title: 'Galeri', kind: 'detail', detailOf: 'gallery' },
        ],
        ['hero', 'services', 'features', 'process', 'gallery', 'blogLatest', 'faq', 'cta', 'contact', 'footer'],
      ),
    },
  ]

  for (const { name, s } of cases) {
    it(`${name}: every page resolves`, () => {
      const missing = (s.pages ?? []).filter((p) => !p.isHome).filter((p) => findPublicPage(s, p.slug) === null)
      expect(missing.map((p) => p.slug)).toEqual([])
    })
  }
})

describe('editor: add page suggestions and operation', () => {
  it('suggests Turkish addresses per kind and English ones for English sites', () => {
    expect(CANONICAL_KINDS.map((k) => suggestPageSlug(k, 'tr', []))).toEqual(
      expect.arrayContaining(['hakkimizda', 'hizmetlerimiz', 'sss', 'iletisim', 'galeri']),
    )
    expect(CANONICAL_KINDS.map((k) => suggestPageSlug(k, 'en', []))).toEqual(
      expect.arrayContaining(['about', 'services', 'faq', 'contact', 'gallery']),
    )
  })

  it('adds -2 on a clash and leaves existing pages untouched', () => {
    expect(suggestPageSlug('contact', 'tr', ['home', 'iletisim'])).toBe('iletisim-2')
    expect(suggestPageSlug('contact', 'tr', ['iletisim', 'iletisim-2'])).toBe('iletisim-3')

    const base = site(
      [{ slug: 'home', title: 'Ana Sayfa', isHome: true }, { slug: 'contact', title: 'İletişim', kind: 'custom', own: ['contact'] }],
      ['hero', 'about', 'contact', 'footer'],
    )
    const next = applyOperation(base, { op: 'addPage', title: 'İletişim', slug: 'contact', kind: 'contact' })
    expect(next.pages?.map((p) => p.slug)).toEqual(['home', 'contact', 'contact-2'])
    expect(next.pages?.[1].slug).toBe('contact')
  })

  it('a new page of a known kind starts with its matching sections; a blank page is not served', () => {
    const base = site([{ slug: 'home', title: 'Ana Sayfa', isHome: true }], ['hero', 'about', 'faq', 'footer'])
    const withFaq = applyOperation(base, { op: 'addPage', title: 'SSS', slug: 'sss', kind: 'faq' })
    expect(findPublicPage(withFaq, 'sss')).not.toBeNull()
    const blank = applyOperation(base, { op: 'addPage', title: 'Boş', slug: 'bos' })
    expect(findPublicPage(blank, 'bos')).toBeNull()
  })
})
