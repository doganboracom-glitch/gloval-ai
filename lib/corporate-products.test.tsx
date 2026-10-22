import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { emptyProductDraft, guardCorporateCatalog, hasNamedProducts, stripInventedStoreSections } from '@/lib/corporate-products'
import { fallbackWebsite, type Section, type WebsiteSchema } from '@/lib/website-schema'
import { INLINE_CATALOG_PLAN_ACCESS, planAllowsInlineCatalog } from '@/lib/pricing-config'
import { demoCatalogs } from '@/lib/demo-catalog'

type ProductsSection = Extract<Section, { type: 'products' }>

const IMAGE = 'a product photo on a plain background'

function corporate(): WebsiteSchema {
  const site = fallbackWebsite('mimarlık ofisi', 'tr')
  return { ...site, sections: site.sections.filter((s) => s.type !== 'products' && s.type !== 'categories') }
}

function productsSection(names: string[], inline: boolean): ProductsSection {
  return {
    type: 'products',
    title: 'Zzz Katalog Başlığı',
    inline,
    items: names.map((name) => ({ name, price: '', imagePrompt: IMAGE })),
  } as ProductsSection
}

describe('AI never invents a product catalog on a corporate site', () => {
  it('generation strips invented store sections but keeps the inline catalog', () => {
    const base = corporate()
    const withStore: WebsiteSchema = {
      ...base,
      sections: [...base.sections, productsSection(['Uydurma Ürün'], false), { type: 'categories', title: 'Kategoriler', items: [] } as unknown as Section],
    }
    const stripped = stripInventedStoreSections(withStore)
    expect(stripped.sections.some((s) => s.type === 'categories')).toBe(false)
    expect(stripped.sections.some((s) => s.type === 'products' && !s.inline)).toBe(false)

    const inline: WebsiteSchema = { ...base, sections: [...base.sections, productsSection([''], true)] }
    expect(stripInventedStoreSections(inline)).toBe(inline)
  })

  it('an AI edit cannot add a product the user did not name', () => {
    const original = { ...corporate(), sections: [...corporate().sections, productsSection(['Mevcut Proje'], true)] }
    const invented = {
      ...original,
      sections: original.sections.map((s) =>
        s.type === 'products' ? { ...s, items: [...s.items, { name: 'Uydurma Villa', price: '₺1', imagePrompt: IMAGE }] } : s,
      ),
    }
    const guarded = guardCorporateCatalog(original, invented, 'bölümü daha şık yap')
    const names = guarded.sections.flatMap((s) => (s.type === 'products' ? s.items.map((i) => i.name) : []))
    expect(names).toEqual(['Mevcut Proje'])

    const typed = guardCorporateCatalog(original, invented, 'Uydurma Villa adlı ürünü ekle')
    const typedNames = typed.sections.flatMap((s) => (s.type === 'products' ? s.items.map((i) => i.name) : []))
    expect(typedNames).toContain('Uydurma Villa')
  })

  it('an AI edit cannot add a storefront section to a corporate site', () => {
    const original = corporate()
    const candidate = { ...original, sections: [...original.sections, productsSection(['X'], false)] }
    const guarded = guardCorporateCatalog(original, candidate, 'ürünler ekle')
    expect(guarded.sections.some((s) => s.type === 'products')).toBe(false)
  })

  it('an empty inline catalog is not rendered on the site', () => {
    const base = corporate()
    const empty: WebsiteSchema = { ...base, sections: [...base.sections, productsSection([''], true)] }
    expect(hasNamedProducts(productsSection([emptyProductDraft().name], true))).toBe(false)
    const html = renderToStaticMarkup(<WebsiteRenderer site={empty} pageRouting initialPage={null} />)
    expect(html).not.toContain('Zzz Katalog Başlığı')

    const filled: WebsiteSchema = { ...base, sections: [...base.sections, productsSection(['Gerçek Ürün'], true)] }
    const filledHtml = renderToStaticMarkup(<WebsiteRenderer site={filled} pageRouting initialPage={null} />)
    expect(filledHtml).toContain('Gerçek Ürün')
  })
})

describe('inline corporate catalog plan gate', () => {
  it('is open on every plan, so editor and server share one decision', () => {
    for (const code of ['free', 'starter', 'pro', 'ecommerce'] as const) {
      expect(INLINE_CATALOG_PLAN_ACCESS[code]).toBe(true)
      expect(planAllowsInlineCatalog(code)).toBe(true)
    }
    expect(planAllowsInlineCatalog(null)).toBe(true)
  })
})

describe('sample corporate demo catalogs', () => {
  const samples = demoCatalogs.filter((c) => c.sampleCatalog)

  it('two corporate demos (mimarlik, dis-klinigi) ship six sample items each', () => {
    expect(samples.map((c) => c.slug).sort()).toEqual(['dis-klinigi', 'mimarlik'])
    for (const catalog of samples) {
      expect(catalog.products).toHaveLength(6)
      expect(new Set(catalog.products.map((p) => p.slug)).size).toBe(6)
    }
  })

  it('has no placeholder text and real demo addresses', () => {
    for (const catalog of samples) {
      expect(catalog.productsHref('tr')).toBe(`/demo/${catalog.slug}/urunler?lang=tr`)
      for (const item of catalog.products) {
        expect(JSON.stringify(item).toLowerCase()).not.toMatch(/lorem|ipsum|placeholder|xxx/)
        expect(item.image).toMatch(/^\/demos\//)
      }
    }
  })
})
