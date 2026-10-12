import { describe, expect, it } from 'vitest'
import { buildProductJsonLd, productJsonLdScript } from './product-json-ld'

const product: any = {
  id: 'product-1',
  name: '</script><script>alert(1)</script>',
  description: 'A </script> description',
  sku: 'SKU-42',
  price_cents: 12900,
  currency: 'TRY',
  images: [{ url: 'https://example.com/product.jpg', alt: 'Product' }],
  track_stock: true,
  stock: 3,
} as never

describe('product JSON-LD', () => {
  it('escapes script-breaking characters and preserves the real SKU', () => {
    const script = productJsonLdScript(product)
    expect(script).not.toContain('</script>')
    expect(script).toContain('\\u003c/script\\u003e')
    expect(buildProductJsonLd(product)).toMatchObject({ sku: 'SKU-42' })
    expect(buildProductJsonLd({ ...product, sku: null })).not.toHaveProperty('sku')
  })
})
