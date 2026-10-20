import { describe, expect, it } from 'vitest'
import { cleanDraft, cleanDraftBody, draftSlug, normalizeDraftRequest } from '@/lib/blog-ai-draft'

const GOOD_BODY = [
  '## Hedef kitleyi tanımlayın',
  'Web sitesi kurarken önce kimlere ulaşmak istediğinizi belirleyin. Sayfa yapısını bu kitlenin sorularına göre sade tutun.',
  '## Sayfa yapısı',
  '- Ana sayfada işletmenizi tek cümleyle anlatın.',
  '- İletişim bilgilerini her sayfadan ulaşılabilir bırakın.',
  'Düzenli olarak içeriği gözden geçirmek, sitenin güncel kalmasını sağlar. Küçük adımlarla ilerlemek çoğu zaman daha sürdürülebilirdir.',
].join('\n')

describe('normalizeDraftRequest', () => {
  it('requires a topic of a sensible length', () => {
    expect(normalizeDraftRequest({ topic: 'abc' }).ok).toBe(false)
    expect(normalizeDraftRequest({ topic: 'x'.repeat(200) }).ok).toBe(false)
    expect(normalizeDraftRequest(null).ok).toBe(false)
  })

  it('accepts keywords as a list or comma string, de-duplicated and capped', () => {
    const fromString = normalizeDraftRequest({ topic: 'Yerel işletmeler için web sitesi', keywords: 'seo, web sitesi, seo' })
    expect(fromString).toEqual({ ok: true, value: { topic: 'Yerel işletmeler için web sitesi', keywords: ['seo', 'web sitesi'] } })
    const many = normalizeDraftRequest({ topic: 'Yerel işletmeler için web sitesi', keywords: Array.from({ length: 20 }, (_, i) => `k${i}`) })
    expect(many.ok && many.value.keywords.length).toBe(8)
  })
})

describe('cleanDraftBody', () => {
  it('removes sentences carrying statistics, citations, quotes and links', () => {
    const { body, removed } = cleanDraftBody(
      [
        'Düzenli yayın önemlidir. Siteler %40 daha fazla ziyaret alır. Bir araştırmaya göre sonuç değişir.',
        'Detay için [buraya](https://example.com) bakın.',
        '> Bu bir alıntıdır.',
      ].join('\n'),
    )
    expect(body).toContain('Düzenli yayın önemlidir.')
    expect(body).not.toMatch(/%40|araştırma|https?:|alıntı/i)
    expect(body).toContain('buraya')
    expect(removed).toBeGreaterThanOrEqual(3)
  })
})

describe('cleanDraft', () => {
  it('returns null when too little survives cleaning', () => {
    expect(cleanDraft({ body: 'Kısa.' }, 'Konu')).toBeNull()
  })

  it('bounds fields, falls back to the topic for an unsafe title and drops unverifiable tags', () => {
    const draft = cleanDraft(
      {
        title: 'Müşterilerin %90 memnun',
        excerpt: 'Kısa bir özet.',
        body: GOOD_BODY,
        seoTitle: '',
        metaDescription: '',
        tags: ['seo', 'en iyi ajans'],
      },
      'Yerel işletmeler için web sitesi',
    )
    expect(draft?.title).toBe('Yerel işletmeler için web sitesi')
    expect(draft?.tags).toEqual(['seo'])
    expect(draft?.seoTitle).toBe(draft?.title)
  })
})

describe('draftSlug', () => {
  it('builds an ASCII slug and never returns an empty one', () => {
    expect(draftSlug('Özel Tasarım Nedir?')).toBe('ozel-tasarim-nedir')
    expect(draftSlug('???')).toBe('taslak')
  })
})
