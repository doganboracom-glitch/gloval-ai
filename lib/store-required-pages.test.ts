import { describe, expect, it } from 'vitest'
import { hiddenStorePageCopy, storeRequiredPageGaps } from './store-required-pages'
import { applyOperation } from './website-edit-operations'
import { LEGAL_DRAFT_NOTES, LEGAL_DOC_ENTRIES } from './legal-editor'
import { buildCancellationAndRefund, buildDistanceSalesNotice } from './site-legal-templates'
import type { WebsiteSchema } from './website-schema'

const site = (sections: Array<Record<string, unknown>>) =>
  ({
    meta: { name: 'Acme', language: 'tr' },
    navigation: { logoText: 'Acme', links: [] },
    sections,
  }) as unknown as WebsiteSchema

describe('storeRequiredPageGaps', () => {
  it('is empty for non-store sites', () => {
    expect(storeRequiredPageGaps(site([{ type: 'hero' }, { type: 'footer' }]))).toEqual([])
  })

  it('reports missing and hidden pages on a store', () => {
    const s = site([{ type: 'hero' }, { type: 'products' }, { type: 'contact', hidden: true }, { type: 'footer' }])
    expect(storeRequiredPageGaps(s)).toEqual([
      { type: 'about', state: 'missing' },
      { type: 'contact', state: 'hidden', index: 2 },
    ])
  })

  it('one click on a hidden page clears the gap', () => {
    const s = site([{ type: 'products' }, { type: 'about', hidden: true }, { type: 'contact' }, { type: 'footer' }])
    const [gap] = storeRequiredPageGaps(s)
    expect(gap).toMatchObject({ type: 'about', state: 'hidden', index: 1 })
    const next = applyOperation(s, { op: 'setSectionHidden', index: 1, hidden: false })
    expect(storeRequiredPageGaps(next)).toEqual([])
  })

  it('one click on a missing page clears the gap', () => {
    const s = site([{ type: 'products' }, { type: 'contact' }, { type: 'footer' }])
    expect(storeRequiredPageGaps(s)).toEqual([{ type: 'about', state: 'missing' }])
    expect(storeRequiredPageGaps(applyOperation(s, { op: 'addSection', sectionType: 'about' }))).toEqual([])
  })

  it('has copy for both languages', () => {
    expect(hiddenStorePageCopy('about', 'tr').action).toBe('Göster.')
    expect(hiddenStorePageCopy('contact', 'en').action).toBe('Show it.')
  })
})

describe('Teslimat ve İade document', () => {
  const doc = buildCancellationAndRefund('Acme')
  const text = doc.sections.map((s) => `${s.heading}\n${s.paragraphs.join('\n')}`).join('\n')

  it('is one combined, editable document with a draft note', () => {
    expect(doc.title).toBe('Teslimat ve İade')
    expect(LEGAL_DOC_ENTRIES.find((e) => e.slug === 'iptal-ve-iade')?.title).toBe('Teslimat ve İade')
    expect(LEGAL_DRAFT_NOTES['iptal-ve-iade']).toContain('hukuk ekibi')
  })

  it('covers delivery time, fee, region, damaged delivery, returns and exchange steps', () => {
    for (const phrase of [
      'Teslimat Süresi',
      'Teslimat Bölgesi ve Ücretler',
      'kargo ücreti',
      'Hasarlı',
      'eksik',
      'İade Süreci',
      'değiştirilir',
    ]) {
      expect(text).toContain(phrase)
    }
  })

  it('does not contradict the distance-sales contract on withdrawal terms', () => {
    const sales = buildDistanceSalesNotice('Acme')
    const salesText = sales.sections.map((s) => s.paragraphs.join(' ')).join(' ')
    for (const fact of ['14 gün', 'on dört']) {
      const inSales = salesText.includes(fact)
      if (inSales) expect(text.includes('14')).toBe(true)
    }
    expect(text).toContain('14 gün')
    expect(salesText).toContain('14 (on dört) gün')
  })
})
