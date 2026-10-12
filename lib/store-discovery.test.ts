import { describe, expect, it } from 'vitest'
import type { StoreCollection, StoreProduct } from './store'
import {
  DEFAULT_FILTERS,
  applyDiscovery,
  foldText,
  hasActiveFilters,
  matchesQuery,
  parseFilters,
  parsePriceTl,
  priceRangeCents,
  serializeFilters,
} from './store-discovery'

const known = { categories: ['Yüzük', 'Kolye'], collections: ['yaz', 'kis'] }

function product(id: string, extra: Partial<StoreProduct> = {}): StoreProduct {
  return {
    id,
    project_id: 'p',
    name: `Ürün ${id}`,
    slug: id,
    description: null,
    price_cents: 10000,
    currency: 'TRY',
    stock: 5,
    images: [],
    category_id: null,
    ...extra,
  } as StoreProduct
}

const collection = (slug: string, product_ids: string[]): StoreCollection =>
  ({ id: slug, name: slug, slug, sort_order: 0, auto_best_sellers: false, product_ids }) as StoreCollection

describe('foldText / matchesQuery', () => {
  it('folds Turkish dotted and dotless i', () => {
    expect(foldText('IŞIK İNCİ ığ')).toBe('isik inci ig')
  })

  it('requires every token and matches name, description, category and sku', () => {
    const p = product('1', { name: 'Altın Yüzük', category_name: 'Takı', sku: 'AB-12' })
    expect(matchesQuery(p, 'altin yuzuk')).toBe(true)
    expect(matchesQuery(p, 'taki ab-12')).toBe(true)
    expect(matchesQuery(p, 'altin kolye')).toBe(false)
    expect(matchesQuery(p, '   ')).toBe(true)
  })
})

describe('parsePriceTl / priceRangeCents', () => {
  it('accepts comma or dot decimals and rejects junk', () => {
    expect(parsePriceTl('12,5')).toBe(12.5)
    expect(parsePriceTl('12.50')).toBe(12.5)
    for (const bad of ['-1', 'abc', '1e3', '12.345', '', '999999999']) expect(parsePriceTl(bad)).toBeNull()
  })

  it('swaps a reversed range and never hides the catalog for invalid input', () => {
    expect(priceRangeCents({ min: '50', max: '10' })).toEqual({ min: 1000, max: 5000 })
    expect(priceRangeCents({ min: 'x', max: '' })).toEqual({ min: 0, max: Number.POSITIVE_INFINITY })
  })
})

describe('parseFilters / serializeFilters', () => {
  it('drops unknown category, collection and sort values', () => {
    const f = parseFilters(
      { kategori: 'Bilinmeyen', koleksiyon: 'yok', sirala: 'rastgele', q: '  yaz   tatili ' },
      known,
    )
    expect(f).toMatchObject({ kategori: '', koleksiyon: '', sirala: '', q: 'yaz tatili' })
  })

  it('reads array params, URLSearchParams and the flag toggles', () => {
    expect(parseFilters({ kategori: ['Yüzük', 'Kolye'] }, known).kategori).toBe('Yüzük')
    const params = new URLSearchParams('koleksiyon=yaz&indirim=1&stok=1&min=100&max=20')
    expect(parseFilters(params, known)).toMatchObject({
      koleksiyon: 'yaz',
      indirim: true,
      stok: true,
      min: '20',
      max: '100',
    })
  })

  it('round-trips and omits defaults', () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe('')
    const filters = parseFilters({ q: 'altın', koleksiyon: 'kis', sirala: 'artan', indirim: '1' }, known)
    expect(parseFilters(new URLSearchParams(serializeFilters(filters)), known)).toEqual(filters)
  })

  it('counts a non-default sort as an active filter', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sirala: 'artan' })).toBe(true)
  })
})

describe('applyDiscovery', () => {
  const products = [
    product('a', { price_cents: 5000, stock: 0, category_name: 'Yüzük', created_at: '2024-01-01' }),
    product('b', { price_cents: 20000, compare_at_price_cents: 40000, category_name: 'Kolye', created_at: '2024-03-01' }),
    product('c', { price_cents: 8000, compare_at_price_cents: 10000, category_name: 'Yüzük', created_at: '2024-02-01' }),
  ]
  const collections = [collection('yaz', ['c', 'a'])]
  const run = (patch: Partial<typeof DEFAULT_FILTERS>) =>
    applyDiscovery(products, { ...DEFAULT_FILTERS, ...patch }, collections).map((p) => p.id)

  it('keeps catalog order with no filters', () => {
    expect(run({})).toEqual(['a', 'b', 'c'])
  })

  it('filters by category, stock, discount and price', () => {
    expect(run({ kategori: 'Yüzük' })).toEqual(['a', 'c'])
    expect(run({ stok: true })).toEqual(['b', 'c'])
    expect(run({ indirim: true })).toEqual(['b', 'c'])
    expect(run({ min: '60', max: '100' })).toEqual(['c'])
  })

  it('restricts to a collection and defaults to the owner order inside it', () => {
    expect(run({ koleksiyon: 'yaz' })).toEqual(['c', 'a'])
  })

  it('lets an explicit sort override the collection order', () => {
    expect(run({ koleksiyon: 'yaz', sirala: 'artan' })).toEqual(['a', 'c'])
  })

  it('sorts by newest, price and discount depth', () => {
    expect(run({ sirala: 'yeni' })).toEqual(['b', 'c', 'a'])
    expect(run({ sirala: 'azalan' })).toEqual(['b', 'c', 'a'])
    expect(run({ sirala: 'indirim' })).toEqual(['b', 'c', 'a'])
  })

  it('ignores a collection slug that is not in the list', () => {
    expect(run({ koleksiyon: 'silinmis' })).toEqual(['a', 'b', 'c'])
  })
})
