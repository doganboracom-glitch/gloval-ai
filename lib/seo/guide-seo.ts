import type { Metadata } from 'next'
import {
  countGuideWords,
  guideBodyText,
  GUIDE_CATEGORY_LABELS,
  GUIDE_PAGE_COPY,
  type Guide,
  type GuideLocale,
} from '@/lib/content/guides'
import { seoLanguageAlternates, seoPageUrl } from '@/lib/seo/page-seo'

const SITE_NAME = 'GLOVAL AI'

function localeTag(locale: GuideLocale) {
  return locale === 'tr' ? 'tr_TR' : 'en_US'
}

export function buildGuideIndexMetadata(locale: GuideLocale): Metadata {
  const path = '/sss/rehber'
  const copy = GUIDE_PAGE_COPY[locale]
  const title = `${copy.indexTitle} | ${SITE_NAME}`
  const description = copy.indexDescription
  const url = seoPageUrl(path, locale)

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: seoLanguageAlternates(path),
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: localeTag(locale),
      alternateLocale: locale === 'tr' ? 'en_US' : 'tr_TR',
      url,
      title,
      description,
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export function buildGuideArticleMetadata(guide: Guide, locale: GuideLocale): Metadata {
  const content = guide.content[locale]
  const path = `/sss/rehber/${guide.slug}`
  const title = `${content.title} | ${SITE_NAME}`
  const url = seoPageUrl(path, locale)

  return {
    title,
    description: content.description,
    alternates: {
      canonical: url,
      languages: seoLanguageAlternates(path),
    },
    openGraph: {
      type: 'article',
      siteName: SITE_NAME,
      locale: localeTag(locale),
      alternateLocale: locale === 'tr' ? 'en_US' : 'tr_TR',
      url,
      title,
      description: content.description,
    },
    twitter: {
      card: 'summary',
      title,
      description: content.description,
    },
  }
}

export function buildGuideArticleJsonLd(guide: Guide, locale: GuideLocale) {
  const content = guide.content[locale]
  const url = seoPageUrl(`/sss/rehber/${guide.slug}`, locale)

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: content.title,
    description: content.description,
    articleSection: GUIDE_CATEGORY_LABELS[locale][guide.category],
    articleBody: guideBodyText(content),
    wordCount: countGuideWords(content),
    inLanguage: locale === 'tr' ? 'tr-TR' : 'en-US',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    url,
  }
}
