import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fallbackWebsite } from '@/lib/website-schema'

/**
 * /store and /store/<slug> retire ONLY for commerce_mode='catalog' + project_type='corporate'.
 * Every other (mode, type) pair must behave exactly as before: stores render, `none` 404s.
 */

const state = vi.hoisted(() => ({
  mode: 'none' as 'none' | 'ecommerce' | 'catalog',
  projectType: null as string | null,
  catalogPaths: false,
  catalog: null as null | Record<string, unknown>,
}))

class Redirect extends Error {
  constructor(public url: string) {
    super(`REDIRECT:${url}`)
  }
}

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  permanentRedirect: (url: string) => {
    throw new Redirect(url)
  },
}))
vi.mock('@/lib/projects', () => ({
  getPublishedSite: async () => ({ schema: fallbackWebsite('seramik atölyesi', 'tr'), name: 'Atölye' }),
}))
vi.mock('@/lib/commerce-mode-server', () => ({
  getPublishedSiteRouting: async () => ({
    id: 'p1',
    mode: state.mode,
    projectType: state.projectType,
    catalogPaths: state.catalogPaths,
  }),
  getCatalogContext: async (_s: string, _w: unknown, mode: string) => ({ mode, whatsappNumber: '905321234567', origin: 'https://atolye.gloval.site' }),
}))
vi.mock('@/lib/seo/site-seo', () => ({
  getSiteSeoContext: async () => ({ origin: 'https://atolye.gloval.site', isCustomDomain: false, lastModified: '2025-01-01T00:00:00.000Z' }),
}))
vi.mock('@/lib/catalog-public-server', () => ({
  loadCatalogPaths: async (_id: string, products: { slug: string }[]) => ({
    list: '/urunlerimiz',
    products: Object.fromEntries(products.map((p) => [p.slug, `/urunlerimiz/seramik/${p.slug}`])),
    categories: {},
  }),
  loadPublicCatalog: async () => state.catalog,
}))
vi.mock('@/lib/store', () => ({
  getStoreProductBySlug: async (_s: string, productSlug: string) =>
    productSlug === 'yok'
      ? null
      : { id: 'a', slug: productSlug, name: 'Vazo', images: [], seo_title: null, seo_description: null, description: null, category_id: 'c1' },
  getStoreProducts: async () => [],
  getStoreCollections: async () => [],
  getStorePaymentMethods: async () => ({ available: false, methods: [] }),
}))
vi.mock('@/lib/try-on-settings', () => ({ getTryOnConfigForStore: async () => null }))
vi.mock('@/lib/blog-server', () => ({ getSiteBlogData: async () => null }))
vi.mock('@/lib/store-shipping-settings', () => ({ getStoreShippingInfo: async () => ({}) }))
vi.mock('@/lib/product-json-ld', () => ({ productJsonLdScript: () => '{}' }))
vi.mock('@/components/store/product-detail', () => ({ ProductDetail: () => null }))
vi.mock('@/components/store/store-site-shell', () => ({ StoreSiteShell: () => null }))
vi.mock('@/components/store/store-front', () => ({ StoreFront: () => null }))

import { catalogOwnsProductPaths } from '@/lib/commerce-mode'

const MODES = ['none', 'ecommerce', 'catalog'] as const
const TYPES = ['corporate', 'ecommerce', 'portfolio', 'blog', 'landing', null] as const

function setRouting(mode: (typeof MODES)[number], type: string | null) {
  state.mode = mode
  state.projectType = type
  state.catalogPaths = catalogOwnsProductPaths(mode, type)
}

async function storeList() {
  const { default: Page } = await import('@/app/site/[slug]/store/page')
  return Page({ params: Promise.resolve({ slug: 'atolye' }), searchParams: Promise.resolve({}) })
}

async function storeProduct(productSlug = 'vazo') {
  const { default: Page } = await import('@/app/site/[slug]/store/[productSlug]/page')
  return Page({ params: Promise.resolve({ slug: 'atolye', productSlug }) })
}

async function outcome(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
    return 'render'
  } catch (e) {
    if (e instanceof Redirect) return e.url
    return (e as Error).message
  }
}

beforeEach(() => {
  state.catalog = null
})

describe('/store and /store/<slug> per (commerce_mode, project_type)', () => {
  for (const mode of MODES) {
    for (const type of TYPES) {
      const retired = mode === 'catalog' && type === 'corporate'
      const label = `commerce_mode=${mode} project_type=${type}`

      it(`${label}: /store ${retired ? 'redirects to /urunlerimiz' : mode === 'none' ? 'is 404' : 'renders as before'}`, async () => {
        setRouting(mode, type)
        const result = await outcome(storeList)
        if (retired) expect(result).toBe('https://atolye.gloval.site/urunlerimiz')
        else expect(result).toBe(mode === 'none' ? 'NOT_FOUND' : 'render')
      })

      it(`${label}: /store/<slug> ${retired ? 'redirects to /urunlerimiz/<kategori>/<slug>' : mode === 'none' ? 'is 404' : 'renders as before'}`, async () => {
        setRouting(mode, type)
        const result = await outcome(() => storeProduct())
        if (retired) expect(result).toBe('https://atolye.gloval.site/urunlerimiz/seramik/vazo')
        else expect(result).toBe(mode === 'none' ? 'NOT_FOUND' : 'render')
      })
    }
  }

  it('an unknown product on a retired site is still a 404, not a redirect', async () => {
    setRouting('catalog', 'corporate')
    expect(await outcome(() => storeProduct('yok'))).toBe('NOT_FOUND')
  })

  it('uses the permanent redirect (never the temporary one)', async () => {
    const nav = await import('next/navigation')
    expect(Object.keys(nav)).not.toContain('redirect')
  })
})

describe('list page canonical', () => {
  const group = (slug: string, count: number) => ({
    name: slug,
    slug,
    items: Array.from({ length: count }, (_, i) => ({ id: `${slug}${i}`, name: `${slug} ${i}`, slug: `${slug}-${i}` })),
  })

  beforeEach(() => {
    state.catalog = {
      origin: 'https://atolye.gloval.site',
      site: { name: 'Atölye', schema: fallbackWebsite('seramik atölyesi', 'tr') },
      groups: [group('seramik', 26), group('cam', 2)],
    }
  })

  async function listMeta(sayfa?: string) {
    const { generateMetadata } = await import('@/app/site/[slug]/urunlerimiz/page')
    return generateMetadata({ params: Promise.resolve({ slug: 'atolye' }), searchParams: Promise.resolve({ sayfa }) })
  }

  async function categoryMeta(category: string, sayfa?: string) {
    const { generateMetadata } = await import('@/app/site/[slug]/urunlerimiz/[category]/page')
    return generateMetadata({ params: Promise.resolve({ slug: 'atolye', category }), searchParams: Promise.resolve({ sayfa }) })
  }

  it('page 1 is its own clean canonical, later pages carry ?sayfa=', async () => {
    expect((await listMeta()).alternates?.canonical).toBe('https://atolye.gloval.site/urunlerimiz')
    expect((await listMeta('1')).alternates?.canonical).toBe('https://atolye.gloval.site/urunlerimiz')
    expect((await listMeta('3')).alternates?.canonical).toBe('https://atolye.gloval.site/urunlerimiz?sayfa=3')
  })

  it('an out-of-range page canonicalises to the last real page', async () => {
    expect((await listMeta('99')).alternates?.canonical).toBe('https://atolye.gloval.site/urunlerimiz?sayfa=3')
  })

  it('category canonical follows the same rule under its own path', async () => {
    expect((await categoryMeta('seramik')).alternates?.canonical).toBe('https://atolye.gloval.site/urunlerimiz/seramik')
    expect((await categoryMeta('seramik', '2')).alternates?.canonical).toBe('https://atolye.gloval.site/urunlerimiz/seramik?sayfa=2')
    expect((await categoryMeta('cam', '9')).alternates?.canonical).toBe('https://atolye.gloval.site/urunlerimiz/cam')
  })

  it('unknown category and non-catalog sites are 404', async () => {
    await expect(categoryMeta('yok')).rejects.toThrow('NOT_FOUND')
    state.catalog = null
    await expect(listMeta()).rejects.toThrow('NOT_FOUND')
  })
})
