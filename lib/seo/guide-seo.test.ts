import { describe, expect, it } from 'vitest'
import { guideBodyText, GUIDE_PAGE_COPY, GUIDES } from '@/lib/content/guides'
import {
  buildGuideArticleJsonLd,
  buildGuideArticleMetadata,
  buildGuideIndexMetadata,
} from '@/lib/seo/guide-seo'
import { seoLanguageAlternates, seoPageUrl } from '@/lib/seo/page-seo'

const LOCALES = ['tr', 'en'] as const

describe('guide index metadata', () => {
  for (const locale of LOCALES) {
    it(`uses a localized canonical and Open Graph copy (${locale})`, () => {
      const metadata = buildGuideIndexMetadata(locale)
      const url = seoPageUrl('/sss/rehber', locale)
      const openGraph = metadata.openGraph as {
        title?: string
        description?: string
        url?: string
        siteName?: string
      }

      expect(metadata.title).toBe(`${GUIDE_PAGE_COPY[locale].indexTitle} | GLOVAL AI`)
      expect(metadata.description).toBe(GUIDE_PAGE_COPY[locale].indexDescription)
      expect(metadata.alternates?.canonical).toBe(url)
      expect(metadata.alternates?.languages).toEqual(seoLanguageAlternates('/sss/rehber'))
      expect(openGraph).toMatchObject({
        title: metadata.title,
        description: metadata.description,
        url,
        siteName: 'GLOVAL AI',
      })
    })
  }
})

describe('guide article metadata and structured data', () => {
  for (const guide of GUIDES) {
    for (const locale of LOCALES) {
      it(`uses localized visible content for ${guide.slug} (${locale})`, () => {
        const content = guide.content[locale]
        const path = `/sss/rehber/${guide.slug}`
        const url = seoPageUrl(path, locale)
        const metadata = buildGuideArticleMetadata(guide, locale)
        const openGraph = metadata.openGraph as {
          type?: string
          title?: string
          description?: string
          url?: string
          siteName?: string
        }
        const jsonLd = buildGuideArticleJsonLd(guide, locale)

        expect(metadata.title).toBe(`${content.title} | GLOVAL AI`)
        expect(metadata.description).toBe(content.description)
        expect(metadata.alternates?.canonical).toBe(url)
        expect(metadata.alternates?.languages).toEqual(seoLanguageAlternates(path))
        expect(openGraph).toMatchObject({
          type: 'article',
          title: metadata.title,
          description: content.description,
          url,
          siteName: 'GLOVAL AI',
        })
        expect(jsonLd).toMatchObject({
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: content.title,
          description: content.description,
          articleBody: guideBodyText(content),
          url,
          inLanguage: locale === 'tr' ? 'tr-TR' : 'en-US',
        })
      })
    }
  }
})
