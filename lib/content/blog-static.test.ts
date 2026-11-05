import { describe, expect, it } from 'vitest'
import { blocksToMarkup, markupToPlainText, readingTimeMinutes } from '@/lib/blog-markup'
import { staticCategories, staticPosts } from './blog-static'

const post = staticPosts.find(
  (candidate) => candidate.slug === 'iyzico-gloval-ai-isbirligi-e-ticaret-websiteni-bugun-kur',
)

describe('iyzico collaboration blog post', () => {
  it('is Turkish-only, categorized, and dated 5 November 2026', () => {
    expect(post).toBeDefined()
    expect(post?.title.tr).toBe('iyzico × GLOVAL AI İşbirliği: E-Ticaret Websiteni Bugün Kur')
    expect(post?.title.en).toBe('')
    expect(post?.category).toBe('isbirligi')
    expect(staticCategories.find((category) => category.id === post?.category)?.label).toEqual({
      tr: 'İşbirliği',
      en: 'Collaboration',
    })
    expect(post?.publishedAt).toBe('2026-11-05')
  })

  it('has 450–600 Turkish words, the three FAQs, and internal setup/pricing links', () => {
    if (!post) throw new Error('Collaboration post is missing')
    const body = blocksToMarkup(post.body, 'tr')
    const words = markupToPlainText(body).split(/\s+/).filter(Boolean)

    expect(words.length).toBeGreaterThanOrEqual(450)
    expect(words.length).toBeLessThanOrEqual(600)
    expect(body).toContain('[fiyatlandırma sayfasında](/#pricing)')
    expect(body).toContain('[e-ticaret kurulum alanına](/#hero-input)')
    expect(body).toContain('iyzico ile ödeme almak için ne yapmalıyım?')
    expect(body).toContain('%2.29 oranı tüm mağazalar için geçerli mi?')
    expect(body).toContain('Mağaza ve ürün bilgileri otomatik tamamlanıyor mu?')
    expect(body).toContain('* 7 gün vadede %2.29')
    expect(readingTimeMinutes(body)).toBeGreaterThan(1)
  })
})
