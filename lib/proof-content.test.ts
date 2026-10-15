import { describe, expect, it } from 'vitest'
import { isSampleProduct, sanitizeGeneratedProofContent } from './proof-content'
import type { WebsiteSchema } from './website-schema'

function siteOf(...sections: unknown[]): WebsiteSchema {
  return { sections } as unknown as WebsiteSchema
}

const testimonials = (items: Array<Record<string, unknown>>) => ({ type: 'testimonials', title: 'Yorumlar', items })
const stats = (items: Array<Record<string, unknown>>) => ({ type: 'stats', items })
const pricing = (plans: Array<Record<string, unknown>>) => ({ type: 'pricing', title: 'Paketler', plans })
const products = (items: Array<Record<string, unknown>>) => ({ type: 'products', title: 'Ürünler', items })

describe('sanitizeGeneratedProofContent (generation, no baseline)', () => {
  it('flags every testimonial, statistic and pricing plan as sample, even without trigger words', () => {
    const out = sanitizeGeneratedProofContent(
      siteOf(
        testimonials([{ quote: 'Harika bir deneyimdi.', author: 'Ayşe K.' }]),
        stats([
          { value: '24/7', label: 'Destek' },
          { value: 'Ücretsiz', label: 'Keşif' },
        ]),
        pricing([{ name: 'Temel', price: '₺499', features: ['Bir'] }]),
      ),
    )
    const [t, s, p] = out.sections as any[]
    expect(t.items.every((i: any) => i.sample === true)).toBe(true)
    expect(t.sample).toBe(true)
    expect(s.items.every((i: any) => i.sample === true)).toBe(true)
    expect(s.sample).toBe(true)
    expect(p.plans[0].sample).toBe(true)
    expect(p.sample).toBe(true)
  })

  it('flags product discounts and badges but not plain products', () => {
    const out = sanitizeGeneratedProofContent(
      siteOf(
        products([
          { name: 'A', price: '₺100', oldPrice: '₺150' },
          { name: 'B', price: '₺100', badge: 'Çok Satan' },
          { name: 'C', price: '₺100' },
          { name: 'D', price: '%20 indirim' },
        ]),
      ),
    )
    const items = (out.sections[0] as any).items
    expect(items.map((i: any) => i.sample)).toEqual([true, true, undefined, true])
    expect((out.sections[0] as any).sample).toBe(true)
  })

  it('does not flag a plain product section', () => {
    const out = sanitizeGeneratedProofContent(siteOf(products([{ name: 'C', price: '₺100' }])))
    expect((out.sections[0] as any).sample).toBeUndefined()
  })

  it('drops the hero trust line that claims numbers and marks the hero sample', () => {
    const out = sanitizeGeneratedProofContent(
      siteOf({ type: 'hero', trustText: '%98 müşteri memnuniyeti' }, { type: 'hero', trustText: 'Başarı odaklı' }),
    )
    expect((out.sections[0] as any).trustText).toBeUndefined()
    expect((out.sections[0] as any).sample).toBe(true)
    // Turkish letters at the edge of a keyword ("başarı") must still match.
    expect((out.sections[1] as any).trustText).toBeUndefined()
  })

  it('keeps a harmless hero trust line', () => {
    const out = sanitizeGeneratedProofContent(siteOf({ type: 'hero', trustText: 'Kadıköy’de butik hizmet' }))
    expect((out.sections[0] as any).trustText).toBe('Kadıköy’de butik hizmet')
    expect((out.sections[0] as any).sample).toBeUndefined()
  })

  it('removes empty testimonials but keeps flagged sections visible (no hiding)', () => {
    const out = sanitizeGeneratedProofContent(
      siteOf(
        testimonials([{ quote: '  ', author: 'X' }]),
        testimonials([{ quote: 'İyi', author: 'Y' }]),
      ),
    )
    expect(out.sections).toHaveLength(1)
    expect((out.sections[0] as any).sample).toBe(true)
    expect((out.sections[0] as any).hidden).toBeUndefined()
  })
})

describe('sanitizeGeneratedProofContent (AI edit, with baseline)', () => {
  const stored = siteOf(
    testimonials([{ quote: 'Gerçek yorum, %100 memnun kaldım', author: 'Mehmet' }]),
    stats([{ value: '10 yıl', label: 'Deneyim' }]),
    pricing([{ name: 'Standart', price: '₺900', features: ['x'] }]),
    { type: 'hero', trustText: '500+ müşteri' },
  )

  it('leaves content the model returned unchanged exactly as stored', () => {
    const out = sanitizeGeneratedProofContent(structuredClone(stored), stored)
    expect(out).toEqual(stored)
    expect(JSON.stringify(out)).not.toContain('"sample"')
  })

  it('flags only the items the edit added or changed', () => {
    const edited = structuredClone(stored) as any
    edited.sections[0].items.push({ quote: 'Yeni yorum', author: 'Ali' })
    edited.sections[1].items[0].value = '25 yıl'
    const out = sanitizeGeneratedProofContent(edited, stored) as any
    expect(out.sections[0].items[0].sample).toBeUndefined()
    expect(out.sections[0].items[1].sample).toBe(true)
    expect(out.sections[1].items[0].sample).toBe(true)
    expect(out.sections[2].plans[0].sample).toBeUndefined()
    expect(out.sections[3].trustText).toBe('500+ müşteri')
  })
})

describe('isSampleProduct', () => {
  it('only honours the explicit flag, so legacy schemas with badges stay real', () => {
    expect(isSampleProduct({ sample: true })).toBe(true)
    expect(isSampleProduct({})).toBe(false)
    expect(isSampleProduct({ oldPrice: '₺1', badge: 'Yeni' } as never)).toBe(false)
  })
})
