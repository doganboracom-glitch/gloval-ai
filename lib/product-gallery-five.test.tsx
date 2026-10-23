import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProductGallery } from '@/components/store/product-gallery'
import { CatalogProductView } from '@/components/catalog/catalog-product-view'
import { applyOperation } from '@/lib/website-edit-operations'
import {
  collectSiteImages,
  galleryOf,
  moveImage,
  suggestProductImageAlt,
  validateProductImageFile,
} from '@/lib/product-image-rules'
import { productImages, resolveInlineCatalog, toCatalogItem, type InlineProduct } from '@/lib/product-items'
import { buildWhatsappOrderUrl } from '@/lib/commerce-mode'
import { PRODUCT_IMAGES_MAX } from '@/lib/list-limits'
import type { WebsiteSchema } from '@/lib/website-schema'

const MB = 1024 * 1024
const five = Array.from({ length: 5 }, (_, i) => ({ url: `https://img.test/p-${i + 1}.jpg`, alt: `Görsel ${i + 1}` }))

describe('upload rules', () => {
  it('accepts png/jpg/webp up to 5 MB and rejects the rest', () => {
    expect(validateProductImageFile({ type: 'image/png', size: 5 * MB })).toBeNull()
    expect(validateProductImageFile({ type: 'image/jpeg', size: 1 })).toBeNull()
    expect(validateProductImageFile({ type: 'image/webp', size: 1 })).toBeNull()
    expect(validateProductImageFile({ type: 'image/png', size: 5 * MB + 1 })).toBe('size')
    expect(validateProductImageFile({ type: 'image/gif', size: 1 })).toBe('type')
    expect(validateProductImageFile({ type: 'application/pdf', size: 1 })).toBe('type')
  })
  it('keeps the limit at 5 images', () => {
    expect(PRODUCT_IMAGES_MAX).toBe(5)
  })
})

describe('gallery helpers', () => {
  it('reorders with the first image as cover and ignores out-of-range moves', () => {
    expect(moveImage(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveImage(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
  })
  it('suggests an alt text from the product name', () => {
    expect(suggestProductImageAlt('Paslanmaz Vana', 0)).toBe('Paslanmaz Vana')
    expect(suggestProductImageAlt('Paslanmaz Vana', 2)).toBe('Paslanmaz Vana - görünüm 3')
  })
  it('lists every unique image of the site for "pick from existing"', () => {
    const site = {
      sections: [
        { type: 'hero', image: { src: 'https://img.test/a.jpg', alt: 'A' } },
        { type: 'products', items: [{ name: 'X', src: 'https://img.test/a.jpg' }, { name: 'Y', images: [{ src: '/b.png', alt: 'B' }] }] },
      ],
    } as unknown as Pick<WebsiteSchema, 'sections'>
    expect(collectSiteImages(site).map((i) => i.src)).toEqual(['https://img.test/a.jpg', '/b.png'])
  })
  it('falls back to the legacy single src', () => {
    expect(galleryOf({ src: 'https://img.test/one.jpg', alt: 'Bir' })).toEqual([{ src: 'https://img.test/one.jpg', alt: 'Bir' }])
  })
})

function schemaWith(items: InlineProduct[]): WebsiteSchema {
  return {
    meta: { language: 'tr' },
    sections: [{ type: 'products', title: 'Ürünler', items, inline: true, hidden: false }],
  } as unknown as WebsiteSchema
}

describe('five images per product', () => {
  const item: InlineProduct = { name: 'Paslanmaz Vana', price: '1.299 TL', imagePrompt: 'valve' }

  it('stores up to 5 images, requires alt on each and makes the first one the card cover', () => {
    const images = Array.from({ length: 7 }, (_, i) => ({ src: `https://img.test/${i}.jpg`, alt: i === 1 ? '' : `Alt ${i}` }))
    const saved = applyOperation(schemaWith([item]), { op: 'updateProductItem', index: 0, item: 0, patch: { images } } as never)
    const product = (saved.sections[0] as unknown as { items: InlineProduct[] }).items[0]
    expect(product.images).toHaveLength(5)
    expect(product.images?.every((image) => image.alt && image.alt.trim().length > 0)).toBe(true)
    expect(product.images?.[1].alt).toBe('Paslanmaz Vana - görünüm 2')
    expect(product.src).toBe('https://img.test/0.jpg')
    expect(productImages(product)[0].url).toBe('https://img.test/0.jpg')
  })

  it('product page gallery shows 5 large-image slots: arrows, counter and a 5-thumbnail strip', () => {
    const html = renderToStaticMarkup(<ProductGallery images={five} name="Paslanmaz Vana" />)
    expect(html).toContain('1 / 5')
    expect(html).toContain('p-1.jpg')
    for (let i = 1; i <= 5; i += 1) expect(html).toContain(`p-${i}.jpg`)
    expect((html.match(/<img /g) ?? []).length).toBe(6)
    expect(html.match(/aria-label="[^"]*(Önceki|önceki)[^"]*"/g)?.length).toBeGreaterThan(0)
    expect(html.match(/aria-label="[^"]*(Sonraki|sonraki)[^"]*"/g)?.length).toBeGreaterThan(0)
  })
})

describe('legacy pageEnabled is ignored (dbajans-like fixture)', () => {
  it('every product keeps its own page even when old data says pageEnabled: false', () => {
    const legacy = [
      { name: 'Hidrofor Seti', price: '₺12.500', imagePrompt: 'pump', pageEnabled: false },
      { name: 'Paslanmaz Vana', price: '₺1.299', imagePrompt: 'valve', pageEnabled: false },
      { name: 'Bakır Boru', price: '₺450', imagePrompt: 'pipe' },
    ] as unknown as InlineProduct[]
    const catalog = resolveInlineCatalog(schemaWith(legacy))
    expect(catalog?.items.map((i) => i.name)).toEqual(['Hidrofor Seti', 'Paslanmaz Vana', 'Bakır Boru'])
    expect(catalog?.items.every((i) => i.slug.length > 0)).toBe(true)
  })
})

describe('product page layout (reference order)', () => {
  const base: InlineProduct = {
    name: 'Paslanmaz Vana',
    price: '₺899',
    oldPrice: '₺1.299',
    sku: 'PV-100',
    description: 'Kısa açıklama.\n\nUzun açıklama.',
    specs: [{ name: 'Malzeme', value: 'Çelik' }],
    imagePrompt: 'valve',
  } as InlineProduct
  const item = { ...toCatalogItem(base, 'paslanmaz-vana'), images: five }

  it('puts badge, title, prices, buttons, short text and the code/category table in order, tabs below', () => {
    const html = renderToStaticMarkup(
      <CatalogProductView
        labels={{ askPrice: 'Fiyat sorunuz', orderWhatsapp: "WhatsApp'tan Sipariş Ver" } as never}
        storeName="Demo"
        item={item as never}
        related={[]}
        whatsappHref="https://wa.me/905328742961?text=x"
        phone={{ display: '0532 874 29 61', href: 'tel:+905328742961' }}
      />,
    )
    const at = (needle: string) => html.indexOf(needle)
    const order = [
      'data-sale-badge',
      '<h1',
      'data-old-price',
      'data-whatsapp-order',
      'Hemen Ara',
      'Kısa açıklama.',
      'Ürün Kodu',
      'Kategori',
      'role="tablist"',
    ].map(at)
    expect(order.every((n) => n >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).toContain('Ürün Özellikleri')
  })
})

describe('WhatsApp order message price', () => {
  it('uses "1.299 TL" with no lira sign', () => {
    const url = buildWhatsappOrderUrl({
      number: '905328742961',
      productName: 'Vana',
      productUrl: 'https://x.gloval.site/p',
      priceMode: 'show',
      priceCents: 129900,
      currency: 'TRY',
    } as never)
    const text = new URL(url).searchParams.get('text') ?? ''
    expect(text).toContain('Fiyat: 1.299 TL')
    expect(text).not.toContain('₺')
  })
})
