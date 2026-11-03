import { describe, expect, it } from 'vitest'
import { countGuideWords, GUIDE_CATEGORY_ORDER, GUIDES } from './guides'

const REQUIRED_SLUGS = [
  'gloval-ai-nedir',
  'kimler-icin',
  'nasil-calisir',
  'ilk-sitemi-olusturmak',
  'alan-adi-ve-kurumsal-e-posta',
  'e-ticaret-sitesi-acmak',
  'siteyi-yayinlama-ve-duzenleme',
  'ai-kredileri',
]

describe('help center guides', () => {
  it('contains the eight requested guides with unique, stable slugs', () => {
    const slugs = GUIDES.map(({ slug }) => slug)

    expect(slugs).toEqual(REQUIRED_SLUGS)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('keeps Turkish and English article structures aligned', () => {
    for (const guide of GUIDES) {
      expect(Object.keys(guide.content).sort()).toEqual(['en', 'tr'])

      const { tr, en } = guide.content
      expect(tr.sections).toHaveLength(en.sections.length)

      tr.sections.forEach((section, index) => {
        const englishSection = en.sections[index]
        expect(section.paragraphs).toHaveLength(englishSection.paragraphs.length)
        expect(section.steps ?? []).toHaveLength(englishSection.steps?.length ?? 0)
      })
    }
  })

  it('keeps each Turkish and English article between 120 and 250 words', () => {
    for (const guide of GUIDES) {
      for (const locale of ['tr', 'en'] as const) {
        const wordCount = countGuideWords(guide.content[locale])
        expect(wordCount, `${guide.slug} (${locale})`).toBeGreaterThanOrEqual(120)
        expect(wordCount, `${guide.slug} (${locale})`).toBeLessThanOrEqual(250)
      }
    }
  })

  it('assigns every guide to one of the two help categories', () => {
    for (const guide of GUIDES) {
      expect(GUIDE_CATEGORY_ORDER).toContain(guide.category)
    }
  })
})
