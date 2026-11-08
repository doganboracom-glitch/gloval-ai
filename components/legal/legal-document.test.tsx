import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { getLegalDoc, REFERRAL_PARTNER_TERMS_DOC } from '@/lib/legal/documents'
import { REFERRAL_TERMS } from '@/lib/referrals/terms'

const mocks = vi.hoisted(() => ({ lang: 'tr' as 'tr' | 'en' }))

vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({
    lang: mocks.lang,
    t: { nav: { backHome: mocks.lang === 'tr' ? 'Ana sayfaya dön' : 'Back to home' } },
  }),
}))
vi.mock('@/components/site-header', () => ({ SiteHeader: () => null }))
vi.mock('@/components/site-footer', () => ({ SiteFooter: () => null }))

import { LegalDocument } from '@/components/legal/legal-document'

const privacyDoc = getLegalDoc('gizlilik-politikasi')
if (!privacyDoc) throw new Error('Privacy policy document is unavailable')
const cookiesDoc = getLegalDoc('cerez-politikasi')
if (!cookiesDoc) throw new Error('Cookie policy document is unavailable')

describe('referral terms section paragraphs', () => {
  it('renders all five Turkish section 1 clauses as separate paragraphs with readable spacing', () => {
    mocks.lang = 'tr'
    const markup = renderToStaticMarkup(<LegalDocument doc={REFERRAL_PARTNER_TERMS_DOC} />)
    const paragraphs = [...markup.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gu)].map((match) => match[1])
    const expectedParagraphs = REFERRAL_TERMS.tr.sections[0].paragraphs

    expect(expectedParagraphs).toHaveLength(5)
    expect(paragraphs.filter((paragraph) => expectedParagraphs.some((expected) => expected === paragraph))).toEqual(expectedParagraphs)
    expect(markup).toContain('class="mt-4 space-y-4"')
  })

  it('renders the English credit-conversion clause as one unchanged paragraph', () => {
    mocks.lang = 'en'
    const markup = renderToStaticMarkup(<LegalDocument doc={REFERRAL_PARTNER_TERMS_DOC} />)
    const paragraphs = [...markup.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gu)].map((match) => match[1])
    const expectedParagraph = REFERRAL_TERMS.en.sections[0].paragraphs[3]

    expect(paragraphs.filter((paragraph) => paragraph === expectedParagraph)).toHaveLength(1)
  })
})

describe('Meta Pixel privacy section anchor', () => {
  it('uses a matching section id and follows the Meta Ads section in both languages', () => {
    const trPixelIndex = privacyDoc.tr.sections.findIndex((section) => section.id === 'meta-pixel-capi')
    const enPixelIndex = privacyDoc.en.sections.findIndex((section) => section.id === 'meta-pixel-capi')
    const trAdsIndex = privacyDoc.tr.sections.findIndex((section) => section.id === 'meta-ads-verileri')
    const enAdsIndex = privacyDoc.en.sections.findIndex((section) => section.id === 'meta-ads-data')

    expect(trPixelIndex).toBeGreaterThanOrEqual(0)
    expect(enPixelIndex).toBeGreaterThanOrEqual(0)
    expect(privacyDoc.tr.sections[trPixelIndex]?.id).toBe(privacyDoc.en.sections[enPixelIndex]?.id)
    expect(trPixelIndex).toBe(trAdsIndex + 1)
    expect(enPixelIndex).toBe(enAdsIndex + 1)
  })

  it.each([
    ['tr', 'Meta Pixel ve Dönüşümler API’si'],
    ['en', 'Meta Pixel and Conversions API'],
  ] as const)('renders one anchored heading in %s', (locale, heading) => {
    mocks.lang = locale
    const markup = renderToStaticMarkup(<LegalDocument doc={privacyDoc} />)
    const ids = markup.match(/id="meta-pixel-capi"/g) ?? []
    const targetHeadings = markup.match(/<h2\b[^>]*id="meta-pixel-capi"[^>]*>[\s\S]*?<\/h2>/g) ?? []
    expect(ids).toHaveLength(1)
    expect(targetHeadings).toHaveLength(1)
    expect(targetHeadings[0]).toContain(heading)
  })

  it.each(['tr', 'en'] as const)('links the %s cookie policy to the privacy section', (locale) => {
    mocks.lang = locale
    const markup = renderToStaticMarkup(<LegalDocument doc={cookiesDoc} />)
    expect(markup).toContain('href="/yasal/gizlilik-politikasi#meta-pixel-capi"')
  })
})

describe('Google Ads privacy section anchor', () => {
  it.each([
    ['tr', 'Google Ads verileri (GLOVAL Ads)'],
    ['en', 'Google Ads data (GLOVAL Ads)'],
  ] as const)('renders one anchored heading in %s', (locale, heading) => {
    mocks.lang = locale
    const markup = renderToStaticMarkup(<LegalDocument doc={privacyDoc} />)
    const ids = markup.match(/id="google-ads-verileri"/g) ?? []
    const targetHeadings = markup.match(/<h2\b[^>]*id="google-ads-verileri"[^>]*>[\s\S]*?<\/h2>/g) ?? []
    expect(ids).toHaveLength(1)
    expect(targetHeadings).toHaveLength(1)
    expect(targetHeadings[0]).toContain(heading)
    expect(targetHeadings[0]).toContain('scroll-mt-16')
  })
})
