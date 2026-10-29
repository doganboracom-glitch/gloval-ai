import type { Metadata } from 'next'
import { platformUrl } from '@/lib/domains'

/**
 * Single source of truth for the search / social metadata of the public
 * gloval.ai marketing pages.
 *
 * Copy rules: Turkish first, no invented statistics, reviews or ranking claims
 * ("number 1", "best"), and only promises the product actually keeps (a free
 * plan exists; sites can be edited, published and connected to a domain).
 *
 * Pricing, "how it works" and showcase are sections of the home page (anchors
 * `#pricing`, `#how`, `#showcase`), not separate URLs, so they are covered by
 * the `home` entry.
 */

export type SeoLang = 'tr' | 'en'
export type SeoPageKey = 'home' | 'blog' | 'faq' | 'contact' | 'domainSearch' | 'whois'

type PageCopy = {
  /** <title> and og:title / twitter:title. */
  title: string
  description: string
  /** Large line printed on the share image. */
  heading: string
  /** Small line printed under the heading on the share image. */
  tagline: string
}

type PageSeo = { path: string; tr: PageCopy; en: PageCopy }

const TAGLINE = {
  tr: 'Yapay zekâ ile gerçek web siteleri',
  en: 'Real websites, built with AI',
} as const

export const SEO_PAGES: Record<SeoPageKey, PageSeo> = {
  home: {
    path: '/',
    tr: {
      title: 'Yapay Zekâ ile Web Sitesi Oluştur | GLOVAL AI',
      description:
        'Ne istediğini yaz, GLOVAL AI sana çalışan bir web sitesi hazırlasın. E-ticaret sitesi kur, düzenle, alan adını bağla ve yayınla. Ücretsiz başla.',
      heading: 'Yapay zekâ ile web sitesi ve e-ticaret sitesi kur',
      tagline: TAGLINE.tr,
    },
    en: {
      title: 'Build a Website with AI | GLOVAL AI',
      description:
        'Describe your idea and GLOVAL AI builds a working website for you. Set up an online store, edit it, connect your domain and publish. Start free.',
      heading: 'Build a website or online store with AI',
      tagline: TAGLINE.en,
    },
  },
  blog: {
    path: '/blog',
    tr: {
      title: 'Blog: Web Sitesi, SEO ve E-ticaret Rehberleri | GLOVAL AI',
      description:
        'Yapay zekâ ile web sitesi oluşturma, SEO, alan adı, kurumsal e-posta ve e-ticaret sitesi kurma üzerine rehberler ve notlar.',
      heading: 'Blog',
      tagline: 'Web sitesi, SEO ve e-ticaret rehberleri',
    },
    en: {
      title: 'Blog: Guides on AI Websites, SEO and Stores | GLOVAL AI',
      description:
        'Guides and notes on building a website with AI, SEO, domains, business email and setting up an online store.',
      heading: 'Blog',
      tagline: 'Guides on websites, SEO and online stores',
    },
  },
  faq: {
    path: '/sss',
    tr: {
      title: 'Sık Sorulan Sorular | GLOVAL AI',
      description:
        'GLOVAL AI ile web sitesi oluşturma, alan adı bağlama, kurumsal e-posta, yayınlama ve planlar hakkında sık sorulan soruların yanıtları.',
      heading: 'Sık Sorulan Sorular',
      tagline: TAGLINE.tr,
    },
    en: {
      title: 'Frequently Asked Questions | GLOVAL AI',
      description:
        'Answers to common questions about building a website with GLOVAL AI, connecting a domain, business email, publishing and plans.',
      heading: 'Frequently Asked Questions',
      tagline: TAGLINE.en,
    },
  },
  contact: {
    path: '/iletisim',
    tr: {
      title: 'İletişim | GLOVAL AI',
      description:
        'GLOVAL AI ekibine ulaşın: destek e-postası, telefon, adres ve şirket bilgileri.',
      heading: 'İletişim',
      tagline: TAGLINE.tr,
    },
    en: {
      title: 'Contact | GLOVAL AI',
      description:
        'Get in touch with the GLOVAL AI team: support email, phone, address and company details.',
      heading: 'Contact',
      tagline: TAGLINE.en,
    },
  },
  domainSearch: {
    path: '/alan-adi-sorgula',
    tr: {
      title: 'Alan Adı Sorgula: Müsaitlik ve Fiyat | GLOVAL AI',
      description:
        'Markan için alan adını sorgula. .com, .net, .org, .co, .com.tr ve .info uzantılarının müsaitliğini ve yıllık Türk lirası fiyatını giriş yapmadan gör.',
      heading: 'Alan adını sorgula',
      tagline: TAGLINE.tr,
    },
    en: {
      title: 'Domain Name Search: Availability and Price | GLOVAL AI',
      description:
        'Search for your brand domain. See availability and the yearly price in Turkish lira for .com, .net, .org, .co, .com.tr and .info without signing in.',
      heading: 'Search for a domain name',
      tagline: TAGLINE.en,
    },
  },
  whois: {
    path: '/whois',
    tr: {
      title: 'WHOIS Sorgula: Alan Adı Kayıt Bilgisi | GLOVAL AI',
      description:
        'Bir alan adının kayıtlı olup olmadığını, kayıt kuruluşunu, bitiş tarihini ve ad sunucularını ücretsiz gör. Kişisel iletişim bilgileri gösterilmez.',
      heading: 'WHOIS sorgula',
      tagline: TAGLINE.tr,
    },
    en: {
      title: 'WHOIS Lookup: Domain Registration Details | GLOVAL AI',
      description:
        'See for free whether a domain is registered, its registrar, expiry date and name servers. Personal contact details are never shown.',
      heading: 'WHOIS lookup',
      tagline: TAGLINE.en,
    },
  },
}

export const SEO_PAGE_KEYS = Object.keys(SEO_PAGES) as SeoPageKey[]

export function isSeoPageKey(value: string): value is SeoPageKey {
  return Object.hasOwn(SEO_PAGES, value)
}

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const

const LOCALE: Record<SeoLang, string> = { tr: 'tr_TR', en: 'en_US' }

/**
 * Metadata language. Turkish is the default and only an explicit `?lang=en`
 * switches it: the same URL is rendered in the visitor's cookie / browser
 * language, so reading those here would make share previews and crawled
 * snippets depend on whichever crawler headers happen to arrive.
 */
export function resolveSeoLang(value: string | string[] | undefined | null): SeoLang {
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim().toLowerCase() === 'en' ? 'en' : 'tr'
}

/** Absolute URL of a page; the English variant is the `?lang=en` URL. */
export function seoPageUrl(path: string, lang: SeoLang): string {
  const base = platformUrl(path)
  return lang === 'en' ? `${base}?lang=en` : base
}

/** Absolute URL of the dynamic 1200x630 share image for a marketing page. */
export function ogImageUrlForPage(key: SeoPageKey, lang: SeoLang): string {
  const base = platformUrl(`/og/${key}`)
  return lang === 'en' ? `${base}?lang=en` : base
}

/** Absolute URL of the dynamic share image for a blog post. */
export function ogImageUrlForPost(slug: string): string {
  return platformUrl(`/og/post/${slug}`)
}

/** hreflang alternates for a path: Turkish default, English via ?lang=en. */
export function seoLanguageAlternates(path: string): Record<string, string> {
  return {
    'tr-TR': seoPageUrl(path, 'tr'),
    en: seoPageUrl(path, 'en'),
    'x-default': seoPageUrl(path, 'tr'),
  }
}

export function buildPageMetadata(key: SeoPageKey, lang: SeoLang): Metadata {
  const page = SEO_PAGES[key]
  const copy = page[lang]
  const url = seoPageUrl(page.path, lang)
  const image = ogImageUrlForPage(key, lang)
  const alt = `${copy.heading} — GLOVAL AI`

  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: url,
      languages: seoLanguageAlternates(page.path),
    },
    openGraph: {
      type: 'website',
      siteName: 'GLOVAL AI',
      title: copy.title,
      description: copy.description,
      url,
      locale: LOCALE[lang],
      alternateLocale: LOCALE[lang === 'tr' ? 'en' : 'tr'],
      images: [{ url: image, ...OG_IMAGE_SIZE, alt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.title,
      description: copy.description,
      images: [{ url: image, alt }],
    },
  }
}
