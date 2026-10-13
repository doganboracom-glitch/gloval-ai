import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SHOWCASE_LIMIT,
  DEFAULT_SHOWCASE_SOURCE,
  resolveShowcaseSettings,
  selectShowcaseProducts,
} from './store-showcase'
import {
  HOVER_GALLERY_INTERVAL_MS,
  canPlayHoverGallery,
  nextGalleryIndex,
} from './product-card-gallery'
import {
  PRODUCTS_MANAGED_IN_PANEL,
  isBlockedProductOperation,
  lockStorefrontProducts,
} from './storefront-product-lock'
import { revalidateStorefront, storefrontPaths } from './store-revalidate'
import { readProductExtras } from './store-product-display'
import type { EditOperation } from './website-edit-operations'
import type { WebsiteSchema } from './website-schema'

type P = { id: string; price_cents: number; compare_at_price_cents: number | null; show_on_home: boolean }
const product = (id: string, price: number, compare: number | null = null, home = false): P => ({
  id,
  price_cents: price,
  compare_at_price_cents: compare,
  show_on_home: home,
})

const catalog = [
  product('a', 1000, 2000), // 50% off
  product('b', 1000, null, true),
  product('c', 1000, 1000), // not a discount
  product('d', 500, 800, true),
  product('e', 100),
  product('f', 100),
]

describe('home showcase selection (database catalog)', () => {
  it('falls back to latest/4 for legacy schemas without settings', () => {
    expect(resolveShowcaseSettings({})).toEqual({
      source: DEFAULT_SHOWCASE_SOURCE,
      limit: DEFAULT_SHOWCASE_LIMIT,
    })
    expect(resolveShowcaseSettings({ source: 'bogus', limit: 5 })).toEqual({ source: 'latest', limit: 4 })
  })

  it('latest keeps the database order and honors the limit', () => {
    const out = selectShowcaseProducts(catalog, { source: 'latest', limit: 4 })
    expect(out.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(selectShowcaseProducts(catalog, { source: 'latest', limit: 8 })).toHaveLength(6)
  })

  it('sale only keeps genuinely discounted products', () => {
    const out = selectShowcaseProducts(catalog, { source: 'sale', limit: 12 })
    expect(out.map((p) => p.id)).toEqual(['a', 'd'])
  })

  it('manual only keeps owner-selected products', () => {
    const out = selectShowcaseProducts(catalog, { source: 'manual', limit: 12 })
    expect(out.map((p) => p.id)).toEqual(['b', 'd'])
    expect(selectShowcaseProducts(catalog, { source: 'manual', limit: 4 }).length).toBe(2)
  })

  it('returns nothing for an empty catalog so the section can fall back to the schema preview', () => {
    expect(selectShowcaseProducts([], { source: 'latest', limit: 4 })).toEqual([])
  })

  it('reads show_on_home from the row and defaults to false before SQL 038', () => {
    expect(readProductExtras({ show_on_home: true }, 1000).show_on_home).toBe(true)
    expect(readProductExtras({}, 1000).show_on_home).toBe(false)
  })

  it('derives price and discount only from database fields, independent of schema items', () => {
    const [first] = selectShowcaseProducts([product('x', 5499, 7800)], { source: 'latest', limit: 4 })
    expect(first.price_cents).toBe(5499)
    expect(first.compare_at_price_cents).toBe(7800)
  })
})

describe('hover gallery', () => {
  const base = { imageCount: 3, hoverCapable: true, reducedMotion: false }
  it('plays only with 2+ images on a hover-capable device with motion allowed', () => {
    expect(canPlayHoverGallery(base)).toBe(true)
    expect(canPlayHoverGallery({ ...base, imageCount: 1 })).toBe(false)
    expect(canPlayHoverGallery({ ...base, imageCount: 0 })).toBe(false)
    expect(canPlayHoverGallery({ ...base, reducedMotion: true })).toBe(false)
    expect(canPlayHoverGallery({ ...base, hoverCapable: false })).toBe(false)
  })

  it('cycles through images and stays put with a single image', () => {
    expect(nextGalleryIndex(0, 3)).toBe(1)
    expect(nextGalleryIndex(2, 3)).toBe(0)
    expect(nextGalleryIndex(0, 1)).toBe(0)
    expect(HOVER_GALLERY_INTERVAL_MS).toBe(1200)
  })
})

function makeStore(items: Array<{ name: string; price: string }>): WebsiteSchema {
  return {
    meta: { name: 'luna', language: 'tr' },
    navigation: { logoText: 'luna', links: [] },
    pages: [{ slug: 'home', title: 'Ana Sayfa', isHome: true }],
    sections: [{ type: 'hero' }, { type: 'products', title: 'Öne Çıkanlar', items }],
  } as unknown as WebsiteSchema
}

describe('AI/editor product lock', () => {
  const original = makeStore([{ name: 'Yüzük', price: '₺100' }])

  it('blocks item operations on a storefront products section', () => {
    const op = { op: 'updateItemField', index: 1, itemIndex: 0, field: 'price', value: '₺1' } as unknown as EditOperation
    expect(isBlockedProductOperation(original, op)).toBe(true)
    const add = { op: 'addItem', index: 1 } as unknown as EditOperation
    expect(isBlockedProductOperation(original, add)).toBe(true)
    expect(PRODUCTS_MANAGED_IN_PANEL).toBe('products_managed_in_panel')
  })

  it('lets non-product edits through', () => {
    const title = { op: 'updateField', index: 1, field: 'title', value: 'Çok satanlar' } as unknown as EditOperation
    expect(isBlockedProductOperation(original, title)).toBe(false)
    const heroItem = { op: 'updateItemField', index: 0, itemIndex: 0, field: 'x', value: 'y' } as unknown as EditOperation
    expect(isBlockedProductOperation(original, heroItem)).toBe(false)
  })

  it('does not block anything on non-store sites', () => {
    const site = { ...original, sections: [{ type: 'hero' }] } as unknown as WebsiteSchema
    const op = { op: 'addItem', index: 0 } as unknown as EditOperation
    expect(isBlockedProductOperation(site, op)).toBe(false)
  })

  it('restores product items when a model edit rewrites them but keeps other changes', () => {
    const candidate = makeStore([{ name: 'Sahte', price: '₺1' }])
    ;(candidate.sections[1] as { title: string }).title = 'Ayın favorisi'
    const { schema, touched } = lockStorefrontProducts(original, candidate)
    expect(touched).toBe(true)
    const section = schema.sections[1] as unknown as { title: string; items: Array<{ name: string }> }
    expect(section.items[0].name).toBe('Yüzük')
    expect(section.title).toBe('Ayın favorisi')
  })

  it('reports untouched when items are unchanged', () => {
    const candidate = makeStore([{ name: 'Yüzük', price: '₺100' }])
    expect(lockStorefrontProducts(original, candidate).touched).toBe(false)
  })
})

describe('storefront revalidation', () => {
  it('refreshes the whole site tree (home, store, product, checkout) for the slug', async () => {
    const revalidatePath = vi.fn()
    await revalidateStorefront({ findSlug: async () => 'luna-mucevher', revalidatePath }, 'p1')
    expect(revalidatePath).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith('/site/luna-mucevher', 'layout')
    expect(storefrontPaths('x')).toEqual([{ path: '/site/x', type: 'layout' }])
  })

  it('does nothing without a slug and never throws', async () => {
    const revalidatePath = vi.fn()
    await revalidateStorefront({ findSlug: async () => null, revalidatePath }, 'p1')
    expect(revalidatePath).not.toHaveBeenCalled()
    await expect(
      revalidateStorefront({ findSlug: async () => { throw new Error('db down') }, revalidatePath }, 'p1'),
    ).resolves.toBeUndefined()
  })

  it('is wired into create, update, archive and delete product', () => {
    const src = readFileSync(join(process.cwd(), 'lib/ecommerce.ts'), 'utf8')
    expect(src.match(/await refreshStorefront\(supabase, projectId\)/g)).toHaveLength(4)
  })
})

describe('single product card component', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  it('home showcase and store list render the same ProductCard', () => {
    expect(read('components/store/store-front.tsx')).toContain("from './product-card'")
    expect(read('components/website-renderer/sections/products-section.tsx')).toContain(
      "from '@/components/store/product-card'",
    )
  })

  it('editor hides product item fields on storefronts and links to the product panel', () => {
    const src = read('components/editor/section-inspector.tsx')
    expect(src).toContain("const managedProducts = section.type === 'products' && isStorefront(site)")
    expect(src).toContain(
      "{!managedProducts && section.type !== 'footer' && items.length > 0 && (",
    )
    expect(src).toContain('ui.manageProducts')
  })
})
