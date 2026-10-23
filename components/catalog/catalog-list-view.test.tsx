import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CatalogListView } from '@/components/catalog/catalog-list-view'
import { buildCatalogWhatsappUrl, type CatalogGroup, type CatalogItem } from '@/lib/catalog-public'
import { catalogLabels, catalogPageHref, findHeroImage, paginate, parsePage } from '@/lib/catalog-view'
import { buildWhatsappOrderUrl, ASK_PRICE_LABEL } from '@/lib/commerce-mode'
import { fallbackWebsite } from '@/lib/website-schema'

function item(n: number, cat: { name: string; slug: string }, over: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: `${cat.slug}-${n}`, name: `${cat.name} ürün ${n}`, slug: `${cat.slug}-${n}`, description: null,
    priceCents: 12500, currency: 'TRY', priceMode: 'show', compareAtCents: null, sku: null,
    images: [], specs: [], videoUrl: null, categoryName: cat.name, categorySlug: cat.slug,
    seoTitle: null, seoDescription: null, ...over,
  }
}

function group(name: string, slug: string, count: number, over: Partial<CatalogItem> = {}): CatalogGroup {
  return { name, slug, items: Array.from({ length: count }, (_, i) => item(i + 1, { name, slug }, over)) }
}

const TR = catalogLabels('tr')
const EN = catalogLabels('en')

function render(props: Partial<Parameters<typeof CatalogListView>[0]> = {}) {
  return renderToStaticMarkup(
    <CatalogListView
      storeName="Atölye"
      groups={[group('Seramik', 'seramik', 5), group('Cam', 'cam', 3)]}
      labels={TR}
      page={1}
      heroImage={null}
      {...props}
    />,
  )
}

describe('category cards', () => {
  it('shows one card per category on the first page of the full list', () => {
    const html = render()
    const section = html.match(/<section aria-label="Kategoriler">[\s\S]*?<\/section>/)?.[0] ?? ''
    expect(section).toContain('href="/urunlerimiz/seramik"')
    expect(section).toContain('href="/urunlerimiz/cam"')
    expect(section).toContain('5 ürün')
    expect(section).toContain('3 ürün')
  })

  it('uses the first product image of the category as card background', () => {
    const withImage = group('Seramik', 'seramik', 2)
    withImage.items[1] = { ...withImage.items[1], images: [{ url: 'https://img.test/a.jpg', alt: '' }] }
    const html = render({ groups: [withImage, group('Cam', 'cam', 1)] })
    expect(html).toContain('src="https://img.test/a.jpg"')
  })

  it('is hidden for a single category, a category page and pages after the first', () => {
    expect(render({ groups: [group('Seramik', 'seramik', 5)] })).not.toContain('sm:grid-cols-2 md:grid-cols-3')
    expect(render({ activeSlug: 'cam' })).not.toContain('sm:grid-cols-2 md:grid-cols-3')
    expect(render({ page: 2 })).not.toContain('sm:grid-cols-2 md:grid-cols-3')
  })
})

describe('sidebar and counters', () => {
  it('lists Tümü with the total and every category with its own count', () => {
    const html = render()
    const aside = html.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? ''
    expect(aside).toMatch(/Tümü<\/span><span[^>]*>8<\/span>/)
    expect(aside).toMatch(/Seramik<\/span><span[^>]*>5<\/span>/)
    expect(aside).toMatch(/Cam<\/span><span[^>]*>3<\/span>/)
  })

  it('marks Tümü current on the list and the category current on a category page', () => {
    const all = render().match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? ''
    expect(all.match(/aria-current="page"/g)).toHaveLength(1)
    expect(all).toMatch(/href="\/urunlerimiz" aria-current="page"/)
    const cat = render({ activeSlug: 'cam' }).match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? ''
    expect(cat).toMatch(/href="\/urunlerimiz\/cam" aria-current="page"/)
    expect(cat).not.toMatch(/href="\/urunlerimiz" aria-current/)
  })

  it('has no sidebar when there are no categories', () => {
    expect(render({ groups: [] })).not.toContain('<aside')
  })

  it('counts the products of the active category in the summary line', () => {
    expect(render({ activeSlug: 'cam' })).toContain('3 ürün gösteriliyor')
    expect(render()).toContain('8 ürün gösteriliyor')
  })
})

describe('grid', () => {
  it('uses 1 / 2 / 3 columns for the product grid', () => {
    expect(render()).toContain('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3')
  })
})

describe('pagination', () => {
  const big = [group('Seramik', 'seramik', 26)]

  it('first page: no prev, rel=next to ?sayfa=2, 12 cards', () => {
    const html = render({ groups: big })
    const nav = html.match(/<nav aria-label="Sayfalama"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? ''
    expect(nav).not.toContain('rel="prev"')
    expect(nav).toMatch(/href="\/urunlerimiz\?sayfa=2" rel="next"/)
    expect(nav).toMatch(/href="\/urunlerimiz" aria-current="page"/)
    expect(html.match(/<h3/g)).toHaveLength(12)
  })

  it('middle page: prev goes back without a query for page 1, next goes on', () => {
    const nav = render({ groups: big, page: 2 }).match(/<nav aria-label="Sayfalama"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? ''
    expect(nav).toMatch(/href="\/urunlerimiz" rel="prev"/)
    expect(nav).toMatch(/href="\/urunlerimiz\?sayfa=3" rel="next"/)
    expect(nav).toContain('aria-label="Sayfa 2"')
  })

  it('last page: no next and only the remainder is rendered', () => {
    const html = render({ groups: big, page: 3 })
    expect(html).not.toContain('rel="next"')
    expect(html).toMatch(/href="\/urunlerimiz\?sayfa=2" rel="prev"/)
    expect(html.match(/<h3/g)).toHaveLength(2)
  })

  it('category pages paginate under their own path', () => {
    const nav = render({ groups: big, activeSlug: 'seramik', page: 2 }).match(/<nav aria-label="Sayfalama"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? ''
    expect(nav).toMatch(/href="\/urunlerimiz\/seramik" rel="prev"/)
    expect(nav).toMatch(/href="\/urunlerimiz\/seramik\?sayfa=3" rel="next"/)
  })

  it('renders no pagination for a single page', () => {
    expect(render()).not.toContain('<nav aria-label="Sayfalama"')
  })

  it('page helpers clamp and canonicalise', () => {
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage('abc')).toBe(1)
    expect(parsePage('-4')).toBe(1)
    expect(parsePage(['3', '4'])).toBe(3)
    expect(paginate(new Array(26), 99).page).toBe(3)
    expect(catalogPageHref('/urunlerimiz', 1)).toBe('/urunlerimiz')
    expect(catalogPageHref('/urunlerimiz/cam', 2)).toBe('/urunlerimiz/cam?sayfa=2')
  })
})

describe('title band', () => {
  it('falls back to the brand gradient when the site has no hero image', () => {
    const html = render()
    expect(html).toContain('linear-gradient(135deg, var(--site-primary, var(--primary))')
    expect(html).not.toContain('bg-black/65')
  })

  it('puts the hero image behind a dark overlay when there is one', () => {
    const html = render({ heroImage: 'https://img.test/hero.jpg' })
    expect(html).toContain('src="https://img.test/hero.jpg"')
    expect(html).toContain('bg-black/65')
  })

  it('findHeroImage reads the first hero of the site, or null', () => {
    const base = fallbackWebsite('kahve dükkanı', 'tr')
    expect(findHeroImage({ sections: [] })).toBeNull()
    expect(findHeroImage({ sections: [{ type: 'hero', image: { src: 'https://x.test/h.jpg' } }] })).toBe('https://x.test/h.jpg')
    expect(findHeroImage({ sections: [{ type: 'hero', slides: [{}, { src: 'https://x.test/s.jpg' }] }] })).toBe('https://x.test/s.jpg')
    expect(() => findHeroImage(base)).not.toThrow()
  })

  it('renders the title and the category name as h1 with a breadcrumb', () => {
    expect(render()).toMatch(/<h1[^>]*>Ürünlerimiz<\/h1>/)
    const cat = render({ activeSlug: 'cam' })
    expect(cat).toMatch(/<h1[^>]*>Cam<\/h1>/)
    expect(cat).toContain('aria-label="Kırıntı yolu"')
    expect(cat).toMatch(/<li aria-current="page"[^>]*>Cam<\/li>/)
  })
})

describe('tr / en labels', () => {
  it('turkish', () => {
    const html = render()
    for (const text of ['Ürünlerimiz', 'Ana sayfa', 'Kategoriler', 'Tümü', '8 ürün gösteriliyor']) expect(html).toContain(text)
  })

  it('english', () => {
    const html = render({ labels: EN })
    for (const text of ['Our Products', 'Home', 'Categories', 'All', 'Showing 8 products', '5 products']) expect(html).toContain(text)
    expect(html).not.toContain('Ürünlerimiz')
  })

  it('every label exists in both languages', () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(TR).sort())
    for (const key of Object.keys(TR) as (keyof typeof TR)[]) expect(EN[key].length).toBeGreaterThan(0)
  })

  it('empty state is localized', () => {
    expect(render({ groups: [] })).toContain('Henüz ürün eklenmedi.')
    expect(render({ groups: [], labels: EN })).toContain('No products have been added yet.')
  })
})

describe('price_mode and WhatsApp text', () => {
  it('ask products show the localized "contact us" label instead of a price', () => {
    const asked = [group('Seramik', 'seramik', 1, { priceMode: 'ask' })]
    expect(render({ groups: asked })).toContain('Fiyat için iletişime geçin')
    expect(render({ groups: asked })).not.toMatch(/₺|TRY/)
    expect(render({ groups: asked, labels: EN })).toContain('Contact us for price')
  })

  it('show products render the formatted price', () => {
    expect(render()).toMatch(/125 TL/)
  })

  it('catalog product message carries name, code and the /urunlerimiz address', () => {
    const url = buildCatalogWhatsappUrl({
      number: '905321234567', productName: 'Vazo', sku: 'VZ-1',
      productUrl: 'https://luna.gloval.site/urunlerimiz/seramik/vazo',
    })
    expect(url.startsWith('https://wa.me/905321234567?text=')).toBe(true)
    const text = decodeURIComponent(url.split('?text=')[1])
    expect(text).toBe(
      'Merhaba, "Vazo" ürünü hakkında bilgi almak istiyorum.\nÜrün Kodu: VZ-1\nÜrün: https://luna.gloval.site/urunlerimiz/seramik/vazo',
    )
    expect(buildCatalogWhatsappUrl({ number: '90', productName: 'A', productUrl: 'u' })).not.toContain(encodeURIComponent('Ürün Kodu'))
  })

  it('order message states "Fiyat için sor" for price_mode=ask and the price otherwise', () => {
    const base = { number: '905321234567', productName: 'Vazo', productUrl: 'https://s.test/urunlerimiz/seramik/vazo', priceCents: 12500, currency: 'TRY' }
    const asked = decodeURIComponent(buildWhatsappOrderUrl({ ...base, priceMode: 'ask' }).split('?text=')[1])
    expect(asked).toContain(`Fiyat: ${ASK_PRICE_LABEL}`)
    const shown = decodeURIComponent(buildWhatsappOrderUrl({ ...base, priceMode: 'show' }).split('?text=')[1])
    expect(shown).toContain("Fiyat: 125 TL")
    expect(shown).toContain('Ürün: https://s.test/urunlerimiz/seramik/vazo')
  })
})
