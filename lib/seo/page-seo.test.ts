import { describe, expect, it } from 'vitest'
import {
  OG_IMAGE_SIZE,
  SEO_PAGES,
  SEO_PAGE_KEYS,
  buildPageMetadata,
  isSeoPageKey,
  resolveSeoLang,
  type SeoLang,
} from './page-seo'

const LANGS: SeoLang[] = ['tr', 'en']

// Claims we cannot substantiate must never appear in titles/descriptions.
const FORBIDDEN_CLAIMS = /(en iyi|number one|#1|1 numaral|garanti|guaranteed|best in)/i

describe('resolveSeoLang', () => {
  it('defaults to Turkish and only switches on an explicit en', () => {
    expect(resolveSeoLang(undefined)).toBe('tr')
    expect(resolveSeoLang('fr')).toBe('tr')
    expect(resolveSeoLang('en')).toBe('en')
    expect(resolveSeoLang(['EN', 'tr'])).toBe('en')
  })
})

describe('buildPageMetadata', () => {
  for (const key of SEO_PAGE_KEYS) {
    for (const lang of LANGS) {
      describe(`${key} (${lang})`, () => {
        const meta = buildPageMetadata(key, lang)
        const copy = SEO_PAGES[key][lang]

        it('has a bounded title and description without unsupported claims', () => {
          expect(copy.title.length).toBeLessThanOrEqual(60)
          expect(copy.description.length).toBeGreaterThanOrEqual(70)
          expect(copy.description.length).toBeLessThanOrEqual(160)
          expect(`${copy.title} ${copy.description}`).not.toMatch(FORBIDDEN_CLAIMS)
        })

        it('has a self-referencing absolute canonical plus hreflang alternates', () => {
          const canonical = String(meta.alternates?.canonical)
          expect(canonical.startsWith('https://gloval.ai')).toBe(true)
          expect(canonical.endsWith(lang === 'en' ? '?lang=en' : SEO_PAGES[key].path)).toBe(true)
          const languages = meta.alternates?.languages as Record<string, string>
          expect(Object.keys(languages).sort()).toEqual(['en', 'tr-TR', 'x-default'])
          expect(languages['x-default']).toBe(languages['tr-TR'])
          expect(languages.en).toContain('?lang=en')
        })

        it('declares a 1200x630 absolute og:image and a large twitter card', () => {
          const og = meta.openGraph as {
            siteName: string
            locale: string
            url: string
            images: { url: string; width: number; height: number; alt: string }[]
          }
          expect(og.siteName).toBe('GLOVAL AI')
          expect(og.locale).toBe(lang === 'tr' ? 'tr_TR' : 'en_US')
          expect(og.url).toBe(meta.alternates?.canonical)
          expect(og.images).toHaveLength(1)
          expect(og.images[0].url.startsWith('https://gloval.ai/og/')).toBe(true)
          expect(og.images[0].width).toBe(OG_IMAGE_SIZE.width)
          expect(og.images[0].height).toBe(OG_IMAGE_SIZE.height)
          expect(og.images[0].alt.length).toBeGreaterThan(0)

          const twitter = meta.twitter as { card: string; images: { url: string }[] }
          expect(twitter.card).toBe('summary_large_image')
          expect(twitter.images[0].url).toBe(og.images[0].url)
        })
      })
    }
  }
})

describe('Ads metadata copy', () => {
  const expectedCopy: { lang: SeoLang; title: string; description: string }[] = [
    {
      lang: 'tr',
      title: 'GLOVAL Ads AI | Yapay Zekâ ile Reklam Yönetimi',
      description:
        'GLOVAL Ads AI ile reklamını kolayca kur, yapay zekâ ile iyileştir ve performansını raporla. Reklam yönetimini tek platformdan akıllıca yönet.',
    },
    {
      lang: 'en',
      title: 'GLOVAL Ads AI | AI-Powered Ad Management',
      description:
        'Set up your ads easily with GLOVAL Ads AI, improve them with artificial intelligence and report performance. Manage your advertising from a single platform.',
    },
  ]

  for (const { lang, title, description } of expectedCopy) {
    it(`uses the approved ${lang} copy in every metadata field`, () => {
      const meta = buildPageMetadata('ads', lang)
      const openGraph = meta.openGraph as { title?: string; description?: string }
      const twitter = meta.twitter as { title?: string; description?: string }

      expect(SEO_PAGES.ads[lang]).toMatchObject({ title, description })
      expect(meta.title).toBe(title)
      expect(meta.description).toBe(description)
      expect(openGraph.title).toBe(title)
      expect(openGraph.description).toBe(description)
      expect(twitter.title).toBe(title)
      expect(twitter.description).toBe(description)
    })
  }
})

describe('isSeoPageKey', () => {
  it('rejects unknown and prototype keys', () => {
    expect(isSeoPageKey('home')).toBe(true)
    expect(isSeoPageKey('admin')).toBe(false)
    expect(isSeoPageKey('constructor')).toBe(false)
    expect(isSeoPageKey('__proto__')).toBe(false)
  })
})
