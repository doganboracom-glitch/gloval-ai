import { describe, expect, it } from 'vitest'
import { buildProductJsonLd, productJsonLdScript } from '@/lib/product-json-ld'
import { buildPlanView } from '@/lib/plan-copy'
import { CATALOG_PRODUCT_LIMIT } from '@/lib/commerce-mode'
import type { StoreProduct } from '@/lib/store'

function product(overrides: Partial<StoreProduct> = {}): StoreProduct {
  return {
    name: 'Seramik Vazo',
    images: [{ url: 'https://cdn.example/vazo.jpg' }],
    description: 'El yapımı',
    sku: 'VZ-1',
    price_cents: 125000,
    currency: 'TRY',
    stock: 4,
    track_stock: true,
    price_mode: 'show',
    ...overrides,
  } as unknown as StoreProduct
}

describe('product JSON-LD', () => {
  it('publishes price, currency and availability when the price is shown', () => {
    const ld = buildProductJsonLd(product(), 'https://x.gloval.site/store/vazo') as Record<string, any>
    expect(ld.offers).toEqual({
      '@type': 'Offer',
      url: 'https://x.gloval.site/store/vazo',
      price: '1250.00',
      priceCurrency: 'TRY',
      availability: 'https://schema.org/InStock',
    })
  })

  it('omits offers entirely (no price, no stock) for price_mode=ask', () => {
    const ld = buildProductJsonLd(product({ price_mode: 'ask', stock: 0 }), 'https://x.gloval.site/store/vazo')
    expect('offers' in ld).toBe(false)
    const serialized = productJsonLdScript(product({ price_mode: 'ask', stock: 0 }))
    expect(serialized).not.toContain('price')
    expect(serialized).not.toContain('availability')
    expect(serialized).not.toContain('OutOfStock')
    expect(serialized).toContain('Seramik Vazo')
  })

  it('still reports out of stock for shown prices', () => {
    const ld = buildProductJsonLd(product({ stock: 0 })) as Record<string, any>
    expect(ld.offers.availability).toBe('https://schema.org/OutOfStock')
  })
})

describe('PRO plan copy', () => {
  const ids = (lang: 'tr' | 'en') =>
    buildPlanView('pro', 'yearly', lang).groups.flatMap((g) => g.items)

  it('lists the catalog line in Turkish', () => {
    const item = ids('tr').find((i) => i.id === 'catalogOrder')
    expect(item?.label).toBe(`Ürün kataloğu (${CATALOG_PRODUCT_LIMIT} ürüne kadar) ve WhatsApp ile sipariş`)
    expect(item?.label).toContain('50')
  })

  it('lists the catalog line in English', () => {
    const item = ids('en').find((i) => i.id === 'catalogOrder')
    expect(item?.label).toBe(`Product catalog (up to ${CATALOG_PRODUCT_LIMIT} products) and ordering via WhatsApp`)
  })

  it('does not add the catalog line to other plans', () => {
    for (const code of ['free', 'starter', 'ecommerce'] as const) {
      const all = buildPlanView(code, 'yearly', 'tr').groups.flatMap((g) => g.items)
      expect(all.some((i) => i.id === 'catalogOrder')).toBe(false)
    }
  })
})
