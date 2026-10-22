import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CartProvider } from '@/components/store/cart-provider'
import { CatalogProvider } from '@/components/store/catalog-context'
import { ProductCard } from '@/components/store/product-card'
import { ProductDetail } from '@/components/store/product-detail'
import { whatsappOrderHref } from '@/components/store/catalog-context'
import { buildCatalogPaths } from '@/lib/catalog-public'
import type { StoreProduct } from '@/lib/store'

/**
 * The goldens in __snapshots__/store-*.html were generated from the code BEFORE the catalog
 * list redesign (#184). They prove e-commerce storefronts (Luna) and shell-less renders are
 * byte-identical after it. Never regenerate them to make this test pass.
 */

const product: StoreProduct = {
  id: 'p1', project_id: 'proj', name: 'Keten Elbise', slug: 'keten-elbise', description: 'Nefes alan kumaş.',
  price_cents: 249900, currency: 'TRY', stock: 7, images: [{ url: 'https://img.test/e.jpg', alt: 'Elbise' }],
  category_id: 'c1', category_name: 'Elbise', sku: 'LN-1', compare_at_price_cents: 299900,
}
const related: StoreProduct = { ...product, id: 'p2', name: 'Keten Gömlek', slug: 'keten-gomlek', price_cents: 149900 }

const shell = (mode: 'ecommerce' | 'catalog') => ({ mode, whatsappNumber: '905321234567', origin: 'https://luna.gloval.site', slug: 'luna' })

function inCart(node: React.ReactNode, mode?: 'ecommerce' | 'catalog') {
  const body = <CartProvider slug="luna">{node}</CartProvider>
  return renderToStaticMarkup(mode ? <CatalogProvider value={shell(mode)}>{body}</CatalogProvider> : body)
}

describe('e-commerce storefront HTML is unchanged by the catalog redesign', () => {
  it('product page inside an e-commerce shell (Luna)', async () => {
    const html = inCart(<ProductDetail slug="luna" storeName="Luna" product={product} relatedProducts={[related]} />, 'ecommerce')
    await expect(html).toMatchFileSnapshot('./__snapshots__/store-product-detail-ecommerce.html')
  })

  it('product page with no shell context (editor preview / marketing)', async () => {
    const html = inCart(<ProductDetail slug="luna" storeName="Luna" product={product} relatedProducts={[related]} />)
    await expect(html).toMatchFileSnapshot('./__snapshots__/store-product-detail-no-shell.html')
  })

  it('product card inside an e-commerce shell', async () => {
    const html = inCart(<ProductCard product={product} slug="luna" categoryName="Elbise" />, 'ecommerce')
    await expect(html).toMatchFileSnapshot('./__snapshots__/store-product-card-ecommerce.html')
  })

  it('a canonicalPath handed to an e-commerce product page changes nothing', () => {
    const base = <ProductDetail slug="luna" storeName="Luna" product={product} relatedProducts={[related]} />
    const withPath = <ProductDetail slug="luna" storeName="Luna" product={product} relatedProducts={[related]} canonicalPath="/urunlerimiz/elbise/keten-elbise" />
    expect(inCart(withPath, 'ecommerce')).toBe(inCart(base, 'ecommerce'))
  })

  it('e-commerce never gets a WhatsApp order link', () => {
    expect(whatsappOrderHref(shell('ecommerce'), product)).toBeNull()
    expect(whatsappOrderHref(shell('ecommerce'), product, '/urunlerimiz/elbise/keten-elbise')).toBeNull()
    expect(whatsappOrderHref(null, product)).toBeNull()
  })
})

describe('catalog WhatsApp message points at the /urunlerimiz product address', () => {
  const paths = buildCatalogPaths(
    [{ slug: product.slug, category_id: 'c1' }],
    new Map([['c1', { name: 'Elbise', slug: 'elbise' }]]),
  )

  it('uses /urunlerimiz/<kategori>/<slug>, never /store', () => {
    const href = whatsappOrderHref(shell('catalog'), product, paths.products[product.slug])!
    const text = decodeURIComponent(href.split('?text=')[1])
    expect(href.startsWith('https://wa.me/905321234567?text=')).toBe(true)
    expect(text).toContain('Ürün: https://luna.gloval.site/urunlerimiz/elbise/keten-elbise')
    expect(text).not.toContain('/store')
  })

  it('product page in catalog mode links the same address', () => {
    const html = inCart(
      <ProductDetail slug="luna" storeName="Luna" product={product} canonicalPath="/urunlerimiz/elbise/keten-elbise" />,
      'catalog',
    )
    const hrefs = [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) => decodeURIComponent(m[1].replace(/&amp;/g, '&')))
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(href).toContain('/urunlerimiz/elbise/keten-elbise')
      expect(href).not.toContain('/store/')
    }
    expect(html).not.toContain('/store/keten-elbise')
  })
})
