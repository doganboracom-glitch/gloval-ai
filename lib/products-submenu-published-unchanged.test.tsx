import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import type { StoreCatalog } from '@/components/website-renderer/store-catalog-context'
import { buildDemoSite, demos } from '@/lib/demos'
import type { StoreProduct } from '@/lib/store'
import { seedProductsSubmenu } from '@/lib/site-menu'

/**
 * Published storefronts that were saved before the products sub-menu existed
 * carry no `navigation.productsSubmenu`. Their public HTML must stay
 * byte-identical to what `main` rendered BEFORE the sub-menu feature landed:
 * the snapshots in `__snapshots__/published-submenu-*.html` were generated on
 * the commit preceding the feature, never regenerated since.
 */
function product(id: string, category: string): StoreProduct {
  return {
    id,
    project_id: 'p1',
    name: `Ürün ${id}`,
    slug: `urun-${id}`,
    description: null,
    price_cents: 10000,
    currency: 'TRY',
    stock: 5,
    images: [],
    category_id: category,
    category_name: category,
  }
}

function catalog(categories: string[]): StoreCatalog {
  return {
    slug: 'magaza',
    bySlug: {},
    products: categories.map((c, i) => product(String(i + 1), c)),
  }
}

function publishedHtml(lang: 'tr' | 'en', categories: string[], page: string | null): string {
  const demo = demos.find((d) => d.slug === 'eticaret')!
  const full = buildDemoSite(demo, lang)
  // The demo-only hero strip is covered by hero-strip.test.tsx; the pre-feature snapshots predate it.
  // The demo's references block used to be dropped by the old 12-section cap; the pre-feature snapshots never had it.
  const built = {
    ...full,
    sections: full.sections.filter((s) => s.type !== 'heroStrip' && s.type !== 'references'),
    pages: (full.pages ?? []).filter((p) => p.slug !== 'referanslar' && p.slug !== 'references'),
    navigation: {
      ...full.navigation,
      links: full.navigation.links.filter((l) => !/\/(referanslar|references)(\?|$)/.test(l.href)),
    },
  }
  // The English demo now carries labelled example reviews; the pre-feature English snapshot has none, so take
  // them out to keep this fixture the pre-feature HTML. The Turkish demo already had them when it was captured.
  const site =
    lang === 'en'
      ? {
          ...built,
          sections: built.sections.filter((s) => !(s.type === 'testimonials' && s.items.some((i) => i.sample))),
          pages: (built.pages ?? []).filter((p) => p.slug !== 'musteri-yorumlari'),
          navigation: {
            ...built.navigation,
            links: built.navigation.links.filter((l) => !l.href.includes('musteri-yorumlari')),
          },
        }
      : built
  return renderToStaticMarkup(
    <WebsiteRenderer site={site} pageRouting initialPage={page} store={catalog(categories)} />,
  )
}

const CASES = [
  { name: 'store-3-categories-home-tr', render: () => publishedHtml('tr', ['Aksesuar', 'Giyim', 'Ev'], null) },
  { name: 'store-2-categories-home-en', render: () => publishedHtml('en', ['Accessories', 'Clothing'], null) },
]

describe('published sites without productsSubmenu render the pre-feature HTML', () => {
  for (const { name, render } of CASES) {
    it(name, async () => {
      const html = render()
      await expect(html).toMatchFileSnapshot(`./__snapshots__/published-submenu-${name}.html`)
    })
  }

  it('an explicit productsSubmenu: false is identical to the unset legacy value', () => {
    const demo = demos.find((d) => d.slug === 'eticaret')!
    const legacy = buildDemoSite(demo, 'tr')
    const explicitOff = { ...legacy, navigation: { ...legacy.navigation, productsSubmenu: false } }
    const render = (site: typeof legacy) =>
      renderToStaticMarkup(
        <WebsiteRenderer site={site} pageRouting initialPage={null} store={catalog(['Aksesuar', 'Giyim', 'Ev'])} />,
      )
    expect(render(explicitOff)).toBe(render(legacy))
  })

  it('an owner who switched the sub-menu on gets the categories in the header', () => {
    const demo = demos.find((d) => d.slug === 'eticaret')!
    const legacy = buildDemoSite(demo, 'tr')
    const on = { ...legacy, navigation: { ...legacy.navigation, productsSubmenu: true } }
    const render = (site: typeof legacy) =>
      renderToStaticMarkup(
        <WebsiteRenderer site={site} pageRouting initialPage={null} store={catalog(['Aksesuar', 'Giyim', 'Ev'])} />,
      )
    expect(render(on)).not.toBe(render(legacy))
    expect(render(on)).toContain('kategori=Aksesuar')
    expect(render(legacy)).not.toContain('kategori=Aksesuar')
  })

  it('new generations and unpublished drafts are seeded ON, an explicit choice is never overridden', () => {
    const demo = demos.find((d) => d.slug === 'eticaret')!
    const legacy = buildDemoSite(demo, 'tr')
    const render = (site: typeof legacy) =>
      renderToStaticMarkup(
        <WebsiteRenderer site={site} pageRouting initialPage={null} store={catalog(['Aksesuar', 'Giyim', 'Ev'])} />,
      )
    const seeded = seedProductsSubmenu(legacy)
    expect(seeded.navigation.productsSubmenu).toBe(true)
    expect(render(seeded)).toContain('kategori=Aksesuar')
    const off = { ...legacy, navigation: { ...legacy.navigation, productsSubmenu: false } }
    expect(seedProductsSubmenu(off).navigation.productsSubmenu).toBe(false)
  })
})
