import { describe, expect, it } from 'vitest'
import {
  buildBreadcrumbJsonLd,
  buildCatalogProductJsonLd,
  buildCatalogWhatsappUrl,
  catalogProductPath,
  categoryIdentity,
  groupByCategory,
  parseVideoUrl,
  type CatalogItem,
} from '@/lib/catalog-public'

function item(over: Partial<CatalogItem>): CatalogItem {
  return {
    id: 'i', name: 'Vazo', slug: 'vazo', description: null, priceCents: 1000, currency: 'TRY',
    priceMode: 'show', compareAtCents: null, sku: null, images: [], specs: [], videoUrl: null,
    categoryName: 'Seramik', categorySlug: 'seramik', seoTitle: null, seoDescription: null, ...over,
  }
}

describe('catalog paths and grouping', () => {
  it('builds /urunlerimiz/<kategori>/<ürün>', () => {
    expect(catalogProductPath('seramik', 'vazo')).toBe('/urunlerimiz/seramik/vazo')
  })

  it('puts uncategorized products last under Diğer', () => {
    const none = categoryIdentity(null, null)
    const groups = groupByCategory([
      item({ id: '1', categoryName: none.name, categorySlug: none.slug }),
      item({ id: '2' }),
    ])
    expect(groups.map((g) => g.slug)).toEqual(['seramik', 'diger'])
  })
})

describe('parseVideoUrl', () => {
  it('accepts YouTube and Vimeo forms and uses privacy hosts', () => {
    const urls = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    ]
    for (const url of urls) expect(parseVideoUrl(url)?.embedUrl).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(parseVideoUrl('https://vimeo.com/123456789')?.embedUrl).toContain('player.vimeo.com/video/123456789')
  })

  it('rejects other hosts, bad ids and non-http schemes', () => {
    expect(parseVideoUrl('https://evil.example/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(parseVideoUrl('https://youtube.com/watch?v=short')).toBeNull()
    expect(parseVideoUrl('javascript:alert(1)')).toBeNull()
    expect(parseVideoUrl('')).toBeNull()
  })
})

describe('whatsapp and structured data', () => {
  it('message carries name, code and page url', () => {
    const url = buildCatalogWhatsappUrl({ number: '905321112233', productName: 'Vazo', sku: 'V-1', productUrl: 'https://a.gloval.site/urunlerimiz/seramik/vazo' })
    const text = new URL(url).searchParams.get('text') ?? ''
    expect(text).toContain('Vazo')
    expect(text).toContain('Ürün Kodu: V-1')
    expect(text).toContain('https://a.gloval.site/urunlerimiz/seramik/vazo')
  })

  it('never publishes an offer when the price is hidden', () => {
    expect(buildCatalogProductJsonLd(item({ priceMode: 'ask' }), 'https://x').offers).toBeUndefined()
    expect(buildCatalogProductJsonLd(item({}), 'https://x').offers?.price).toBe('10.00')
  })

  it('numbers breadcrumb positions from 1', () => {
    const ld = buildBreadcrumbJsonLd([{ name: 'A', url: 'u1' }, { name: 'B', url: 'u2' }])
    expect(ld.itemListElement.map((e) => e.position)).toEqual([1, 2])
  })
})
