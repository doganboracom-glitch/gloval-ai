import { describe, expect, it } from 'vitest'
import {
  assignProductSlugs,
  inferPriceCurrency,
  inlineCatalogPaths,
  makeProductsInline,
  parsePriceToCents,
  resolveInlineCatalog,
  saleBadge,
  toCatalogItem,
  withProductSlugs,
  type InlineProduct,
} from '@/lib/product-items'
import { isStorefront, type WebsiteSchema } from '@/lib/website-schema'

const product = (over: Partial<InlineProduct> = {}): InlineProduct => ({
  name: 'Paslanmaz Vana',
  price: '₺1.299,90',
  imagePrompt: 'a valve',
  ...over,
})

function site(items: InlineProduct[], inline = true, hidden = false) {
  return {
    sections: [{ type: 'products', title: 'Ürünler', items, inline, hidden }],
  } as unknown as Pick<WebsiteSchema, 'sections'>
}

describe('parsePriceToCents', () => {
  it('reads Turkish and English formats', () => {
    expect(parsePriceToCents('₺1.299,90')).toBe(129990)
    expect(parsePriceToCents('$1,299.90')).toBe(129990)
    expect(parsePriceToCents('1299 TL')).toBe(129900)
    expect(parsePriceToCents('₺1.299')).toBe(129900)
    expect(parsePriceToCents('₺899')).toBe(89900)
  })
  it('returns 0 for unreadable text', () => {
    expect(parsePriceToCents('Fiyat sorunuz')).toBe(0)
    expect(parsePriceToCents(undefined)).toBe(0)
  })
})

describe('saleBadge', () => {
  it('marks a real markdown as sale in the site language', () => {
    expect(saleBadge({ price: '₺899', oldPrice: '₺1.299' }, 'tr')).toBe('İndirimli')
    expect(saleBadge({ price: '$89', oldPrice: '$129' }, 'en')).toBe('Sale')
  })
  it('keeps the owner badge and ignores non-discounts', () => {
    expect(saleBadge({ badge: 'Yeni', price: '₺899', oldPrice: '₺1.299' }, 'tr')).toBe('Yeni')
    expect(saleBadge({ price: '₺899', oldPrice: '₺899' }, 'tr')).toBeUndefined()
    expect(saleBadge({ price: '₺899', oldPrice: '₺500' }, 'tr')).toBeUndefined()
    expect(saleBadge({ price: 'Fiyat sorunuz', oldPrice: '₺500' }, 'tr')).toBeUndefined()
    expect(saleBadge({ price: '₺899' }, 'tr')).toBeUndefined()
  })
})

describe('inferPriceCurrency', () => {
  it('maps symbols and defaults to TRY', () => {
    expect(inferPriceCurrency('$29')).toBe('USD')
    expect(inferPriceCurrency('€10')).toBe('EUR')
    expect(inferPriceCurrency('899')).toBe('TRY')
  })
})

describe('slugs', () => {
  it('derives, keeps stored and de-duplicates', () => {
    expect(assignProductSlugs([{ name: 'Çelik Boru' }, { name: 'Çelik Boru' }, { name: 'X', slug: 'my-slug' }])).toEqual([
      'celik-boru',
      'celik-boru-2',
      'my-slug',
    ])
  })
  it('withProductSlugs is idempotent', () => {
    const section = withProductSlugs({ type: 'products', title: 'T', items: [product()] } as never)
    expect(withProductSlugs(section)).toBe(section)
  })
})

describe('toCatalogItem', () => {
  it('maps price, category, images and valid video only', () => {
    const item = toCatalogItem(
      product({
        category: 'Vanalar',
        oldPrice: '₺1.500',
        src: 'https://example.com/a.webp',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      }),
      'paslanmaz-vana',
    )
    expect(item.priceCents).toBe(129990)
    expect(item.compareAtCents).toBe(150000)
    expect(item.categorySlug).toBe('vanalar')
    expect(item.images).toHaveLength(1)
    expect(item.videoUrl).toContain('youtube')
    expect(toCatalogItem(product({ videoUrl: 'https://evil.example/x' }), 'a').videoUrl).toBeNull()
  })
  it('uses ask mode when there is no readable price', () => {
    expect(toCatalogItem(product({ price: '' }), 'a').priceMode).toBe('ask')
  })
})

describe('resolveInlineCatalog', () => {
  it('is null for a classic showcase, hidden section or no products', () => {
    expect(resolveInlineCatalog(site([product()], false))).toBeNull()
    expect(resolveInlineCatalog(site([product()], true, true))).toBeNull()
    expect(resolveInlineCatalog(site([product({ name: '  ' })]))).toBeNull()
  })
  it('groups by category and builds canonical paths', () => {
    const catalog = resolveInlineCatalog(site([product({ category: 'Vanalar' }), product({ name: 'Boru' })]))!
    expect(catalog.groups.map((g) => g.slug).sort()).toEqual(['diger', 'vanalar'])
    expect(catalog.paths.products['paslanmaz-vana']).toBe('/urunlerimiz/vanalar/paslanmaz-vana')
    expect(inlineCatalogPaths(catalog)).toContain('/urunlerimiz/diger/boru')
  })
})

describe('storefront detection', () => {
  it('an inline catalog is not a store', () => {
    const base = { sections: [], meta: {} } as unknown as WebsiteSchema
    const inline = { ...base, sections: [makeProductsInline({ type: 'products', title: 'T', items: [product()] } as never)] }
    const store = { ...base, sections: [{ type: 'products', title: 'T', items: [product()] }] } as unknown as WebsiteSchema
    expect(isStorefront(inline as WebsiteSchema)).toBe(false)
    expect(isStorefront(store)).toBe(true)
  })
})
