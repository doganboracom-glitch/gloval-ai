import { describe, expect, it, vi } from 'vitest'
import { PRODUCT_LIMITS } from './product-input'
import { StoreAiInvalidResult, StoreAiRefusal } from './store-ai-engine'
import {
  STORE_AI_MAX_IMAGES,
  findProhibitedTopic,
  generateStoreAiText,
  hasUsableInput,
  normalizeGenerated,
  stripMarkup,
  type StoreAiGenerateArgs,
  type StoreAiTextInput,
} from './store-ai-text'

const input: StoreAiTextInput = {
  name: 'Gümüş kolye',
  categoryId: null,
  categories: [
    { id: 'cat-1', name: 'Kolyeler' },
    { id: 'cat-2', name: 'Yüzükler' },
  ],
  specs: [],
  imageUrls: ['https://x/a.webp', 'https://x/b.webp'],
  lang: 'tr',
}

const good = {
  refused: false,
  intro: 'Zarif bir kolye.',
  benefits: ['Günlük kullanıma uygun', 'Hediye için ideal'],
  specs: [{ name: 'Malzeme', value: 'Gümüş', verify: true }],
  seoTitle: 'Gümüş kolye',
  seoDescription: 'Zarif gümüş kolye.',
  imageAlts: ['Gümüş kolye ön görünüm', ''],
  categoryId: 'cat-1',
}

describe('normalizeGenerated', () => {
  it('builds a plain-text description with benefit lines and keeps the verify flag', () => {
    const result = normalizeGenerated(good, input)
    expect(result.description).toBe('Zarif bir kolye.\n\n- Günlük kullanıma uygun\n- Hediye için ideal')
    expect(result.specs).toEqual([{ name: 'Malzeme', value: 'Gümüş', verify: true }])
    expect(result.categoryId).toBe('cat-1')
    expect(result.imageAlts).toEqual(['Gümüş kolye ön görünüm', null])
  })

  it('strips HTML and angle brackets from every text field', () => {
    const result = normalizeGenerated(
      { ...good, intro: '<b>Zarif</b> kolye <script>x</script>', seoTitle: '<h1>Başlık</h1>', imageAlts: ['<img src=x> alt', ''] },
      input,
    )
    expect(result.description).not.toMatch(/[<>]/)
    expect(result.seoTitle).toBe('Başlık')
    expect(result.imageAlts[0]).toBe('alt')
  })

  it('enforces the form limits', () => {
    const long = 'a'.repeat(500)
    const result = normalizeGenerated(
      { ...good, seoTitle: long, seoDescription: long, specs: [{ name: long, value: long, verify: false }] },
      input,
    )
    expect(result.seoTitle.length).toBeLessThanOrEqual(PRODUCT_LIMITS.seoTitle)
    expect(result.seoDescription.length).toBeLessThanOrEqual(PRODUCT_LIMITS.seoDescription)
    expect(result.specs[0].name.length).toBeLessThanOrEqual(PRODUCT_LIMITS.specName)
    expect(result.specs[0].value.length).toBeLessThanOrEqual(PRODUCT_LIMITS.specValue)
  })

  it('caps and de-duplicates specs', () => {
    const specs = Array.from({ length: 40 }, (_, i) => ({ name: `Özellik ${i % 30}`, value: '', verify: false }))
    const result = normalizeGenerated({ ...good, specs }, input)
    expect(result.specs.length).toBeLessThanOrEqual(PRODUCT_LIMITS.specCount)
    expect(new Set(result.specs.map((s) => s.name)).size).toBe(result.specs.length)
  })

  it('drops a category that is not in the store', () => {
    expect(normalizeGenerated({ ...good, categoryId: 'cat-evil' }, input).categoryId).toBeNull()
    expect(normalizeGenerated({ ...good, categoryId: '' }, input).categoryId).toBeNull()
  })

  it('throws a refusal when the model declines', () => {
    expect(() => normalizeGenerated({ ...good, refused: true }, input)).toThrow(StoreAiRefusal)
  })

  it('throws on unusable output', () => {
    expect(() => normalizeGenerated(null, input)).toThrow(StoreAiInvalidResult)
    expect(() => normalizeGenerated({ ...good, intro: '<p></p>', benefits: [] }, input)).toThrow(StoreAiInvalidResult)
    expect(() => normalizeGenerated({ ...good, seoTitle: '' }, input)).toThrow(StoreAiInvalidResult)
  })
})

describe('stripMarkup', () => {
  it('keeps line breaks but removes tags', () => {
    expect(stripMarkup('a <i>b</i>\n\n\n\nc')).toBe('a b\n\nc')
  })
})

describe('findProhibitedTopic', () => {
  it('flags clearly prohibited products', () => {
    expect(findProhibitedTopic('Av tüfeği')).toBe('tufegi')
    expect(findProhibitedTopic('Av tüfek')).toBe('tufek')
    expect(findProhibitedTopic('Replika saat')).toBe('replika')
    expect(findProhibitedTopic('hunting weapon')).toBe('weapon')
  })

  it('uses word boundaries, so ordinary words are not caught', () => {
    expect(findProhibitedTopic('Gümüş kolye', 'Takı', 'Silahşör figürü')).toBeNull()
    expect(findProhibitedTopic('Bombeli cam vazo')).toBeNull()
  })
})

describe('generateStoreAiText', () => {
  it('passes at most the image limit to the model and normalizes the answer', async () => {
    const generate = vi.fn(async (_args: StoreAiGenerateArgs) => good)
    const many = { ...input, imageUrls: Array.from({ length: 9 }, (_, i) => `https://x/${i}.webp`) }
    const result = await generateStoreAiText(many, new AbortController().signal, generate)
    expect(generate.mock.calls[0][0].imageUrls).toHaveLength(STORE_AI_MAX_IMAGES)
    expect(result.seoTitle).toBe('Gümüş kolye')
  })

  it('does not ask for price, VAT or stock', async () => {
    const generate = vi.fn(async (_args: StoreAiGenerateArgs) => good)
    await generateStoreAiText(input, new AbortController().signal, generate)
    expect(generate.mock.calls[0][0].system).toMatch(/Do NOT output price, VAT or stock/)
  })
})

describe('hasUsableInput', () => {
  it('needs a name or a photo', () => {
    expect(hasUsableInput({ name: '  ', imageUrls: [] })).toBe(false)
    expect(hasUsableInput({ name: 'x', imageUrls: [] })).toBe(true)
    expect(hasUsableInput({ name: '', imageUrls: ['u'] })).toBe(true)
  })
})
