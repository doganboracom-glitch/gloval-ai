import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FAQ_SUPPORT_COPY,
  getFaqItems,
  getFaqJsonLd,
  getFaqSupportHref,
} from './faq'
import { getFaqAnswerText } from './types'
import type { FaqItem } from './types'

const locales = ['tr', 'en', 'de', 'fr', 'es', 'it'] as const
const root = path.resolve(__dirname, '../..')

function getItem(id: string): FaqItem {
  const item = getFaqItems().find((candidate) => candidate.id === id)
  if (!item) throw new Error(`Missing FAQ item: ${id}`)
  return item
}

describe('FAQ objection handling', () => {
  it('preserves the existing questions and adds the requested Turkish copy', () => {
    const items = getFaqItems()
    const ids = items.map((item) => item.id)

    expect(ids).toEqual(
      expect.arrayContaining([
        'what-is-gloval',
        'no-code-needed',
        'how-long',
        'free-start',
        'domain-and-email',
        'edit-and-unpublish',
        'site-types',
      ]),
    )
    expect(getItem('site-ready').question.tr).toBe('Site ne kadar sürede hazır olur?')
    expect(getItem('site-ready').answer.tr).toBe(
      'Dakikalar içinde. Ne istediğini anlatırsın, yapay zekâ taslağı hazırlar; düzenleyip tek tıkla yayınlarsın.',
    )
    expect(getItem('site-ownership').question.tr).toBe('Siten ve içeriğin kime ait?')
    expect(getItem('site-ownership').answer.tr).toBe(
      'Siten ve içeriğin sana aittir. Yayınladığın içeriklerin hukuka uygunluğundan ve doğruluğundan site sahibi sorumludur.',
    )
    expect(getItem('ai-review').question.tr).toBe('Yapay zekâ hata yaparsa ne olur?')
    expect(getItem('ai-review').answer.tr).toBe(
      'Yapay zekâ taslak hazırlar; yayınlamadan önce metin ve görselleri incelemek ve düzenlemek sana aittir.',
    )
    expect(getItem('legal-templates').answer.tr).toBe(
      'Gizlilik, KVKK, çerez ve mesafeli satış gibi hazır yasal metin şablonları sunulur; kendi işine göre gözden geçirmen gerekir.',
    )
    expect(getFaqAnswerText(getItem('cancel-anytime'), 'tr')).toBe(
      'Evet, istediğin zaman iptal edebilirsin. Koşulların ayrıntısı için İptal ve İade sayfasına bak.',
    )
    expect(getItem('free-start').answer.tr).toContain('ad.gloval.site')
    expect(getItem('how-long').answer.tr).not.toMatch(/dakika|saniye|\d/)
  })

  it('provides translations for every new FAQ and support prompt in six locales', () => {
    const newItems = ['site-ready', 'site-ownership', 'ai-review', 'legal-templates', 'cancel-anytime']

    for (const id of newItems) {
      const item = getItem(id)
      for (const locale of locales) {
        expect(item.question[locale]).toBeTruthy()
        expect(item.answer[locale]).toBeTruthy()
        if (item.answerLink) {
          expect(item.answerLink.prefix[locale]).toBeTruthy()
          expect(item.answerLink.label[locale]).toBeTruthy()
          if (item.answerLink.suffix) expect(item.answerLink.suffix[locale]).toBeTruthy()
        }
      }
    }

    for (const locale of locales) {
      expect(FAQ_SUPPORT_COPY[locale]?.before).toBeTruthy()
      expect(FAQ_SUPPORT_COPY[locale]?.link).toBeTruthy()
      expect(FAQ_SUPPORT_COPY[locale]?.after).toBeTruthy()
    }
  })

  it('links legal answers to the existing legal routes', () => {
    expect(getItem('site-ownership').answerLink?.target).toEqual({
      kind: 'url',
      href: '/yasal/kullanim-kosullari',
    })
    expect(getItem('cancel-anytime').answerLink?.target).toEqual({
      kind: 'url',
      href: '/yasal/iptal-ve-iade',
    })
    expect(getItem('ai-review').answerLink?.target).toEqual({ kind: 'support' })
  })

  it('uses server-resolved auth state for support links and treats unavailable as a guest', () => {
    expect(getFaqSupportHref('authenticated')).toBe('/support/new')
    expect(getFaqSupportHref('unauthenticated')).toBe('/iletisim')
    expect(getFaqSupportHref('unavailable')).toBe('/iletisim')

    const faqRoute = readFileSync(path.join(root, 'app/sss/page.tsx'), 'utf8')
    expect(faqRoute).toMatch(/getRequestUser\s*\(/)
  })

  it('does not add an auth lookup to the homepage FAQ', () => {
    const homepageSource = [
      readFileSync(path.join(root, 'app/page.tsx'), 'utf8'),
      readFileSync(path.join(root, 'components/faq.tsx'), 'utf8'),
    ].join('\n')

    expect(homepageSource).not.toMatch(/getRequestUser\s*\(|auth\.getUser\s*\(|createClient\s*\(/)
  })

  it('includes every new FAQ in the existing FAQPage JSON-LD', () => {
    const jsonLd = getFaqJsonLd()
    const names = jsonLd.mainEntity.map((entity) => entity.name)

    expect(jsonLd['@type']).toBe('FAQPage')
    expect(jsonLd.mainEntity).toHaveLength(getFaqItems().length)
    expect(names).toEqual(
      expect.arrayContaining([
        'Site ne kadar sürede hazır olur?',
        'Siten ve içeriğin kime ait?',
        'Yapay zekâ hata yaparsa ne olur?',
        'KVKK ve yasal metinler dahil mi?',
        'İstediğim zaman iptal edebilir miyim?',
      ]),
    )
    expect(
      jsonLd.mainEntity.find((entity) => entity.name === 'Siten ve içeriğin kime ait?')
        ?.acceptedAnswer.text,
    ).toContain('Kullanım Koşulları')
  })
})
