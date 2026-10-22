import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fallbackWebsite } from '@/lib/website-schema'

/**
 * #183 switched the tenant sitemap from `getPublishedSiteCommerceMode` to
 * `getPublishedSiteRouting`. This file proves the switch changes nothing for any
 * site that is already published: it runs the REAL commerce-mode-server and the
 * REAL sitemap route against every stored (commerce_mode, project_type) pair and
 * compares with what the old call chain produced.
 *
 * The single pair that is allowed to differ is catalog + corporate (a site that
 * opted into the catalog feature): its products move from /store to /urunlerimiz.
 */

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }),
      }),
    }),
  }),
}))
vi.mock('@/lib/billing', () => ({ getPlanCodeForUser: async () => 'free' }))
vi.mock('@/lib/projects', () => ({
  getPublishedSite: async () => ({ schema: fallbackWebsite('kahve dükkanı', 'tr'), name: 'x' }),
}))
vi.mock('@/lib/site-availability', () => ({
  closedSiteFileResponse: () => new Response('closed', { status: 404 }),
}))
vi.mock('@/lib/seo/site-seo', () => ({
  getSiteSeoContext: async () => ({
    origin: 'https://parity.gloval.site',
    isCustomDomain: false,
    lastModified: '2025-01-01T00:00:00.000Z',
  }),
}))
vi.mock('@/lib/blog-server', () => ({ getLiveBlogPosts: async () => [] }))
vi.mock('@/lib/store', () => ({
  getStoreProducts: async () => [
    { id: 'a', slug: 'cay', name: 'Çay', created_at: '2025-01-01T00:00:00.000Z', category_id: null },
  ],
}))

import { storeSeoPlan, type CommerceMode } from '@/lib/commerce-mode'
import { getPublishedSiteCommerceMode, getPublishedSiteRouting } from '@/lib/commerce-mode-server'

const MODES = [null, 'none', 'ecommerce', 'catalog'] as const
const TYPES = ['corporate', 'ecommerce', 'portfolio', 'blog', 'landing', null] as const

function row(mode: string | null, type: string | null, published = true) {
  return { id: 'p1', owner_id: 'u1', slug: 'parity', published, project_type: type, commerce_mode: mode }
}

const isCatalogCorporate = (mode: string | null, type: string | null) =>
  mode === 'catalog' && type === 'corporate'

beforeEach(() => {
  state.row = null
})

describe('getPublishedSiteRouting vs the call it replaced', () => {
  for (const mode of MODES) {
    for (const type of TYPES) {
      if (isCatalogCorporate(mode, type)) continue
      it(`commerce_mode=${mode} project_type=${type}: same mode and same store SEO plan`, async () => {
        state.row = row(mode, type)
        const oldMode = await getPublishedSiteCommerceMode('parity')
        const routing = await getPublishedSiteRouting('parity')
        expect(routing.mode).toBe(oldMode)
        expect(routing.catalogPaths).toBe(false)
        expect(storeSeoPlan(routing.mode, routing.projectType)).toEqual(storeSeoPlan(oldMode as CommerceMode))
      })
    }
  }

  it('unpublished and unknown sites still fail closed to none', async () => {
    state.row = row('ecommerce', 'ecommerce', false)
    expect(await getPublishedSiteRouting('parity')).toMatchObject({ mode: 'none', catalogPaths: false })
    state.row = null
    expect(await getPublishedSiteRouting('parity')).toMatchObject({ mode: 'none', catalogPaths: false })
  })
})

describe('tenant sitemap of already published sites', () => {
  async function locs(): Promise<string[]> {
    vi.resetModules()
    const { GET } = await import('@/app/site/[slug]/sitemap.xml/route')
    const res = await GET(new Request('https://parity.gloval.site/sitemap.xml'), {
      params: Promise.resolve({ slug: 'parity' }),
    })
    return [...(await res.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])
  }

  it('non-store site: no /store, no /urunlerimiz', async () => {
    state.row = row('none', 'corporate')
    const urls = await locs()
    expect(urls[0]).toBe('https://parity.gloval.site')
    expect(urls.some((u) => u.includes('/store') || u.includes('/urunlerimiz'))).toBe(false)
  })

  it('legacy row without commerce_mode behaves like none', async () => {
    state.row = row(null, 'corporate')
    const urls = await locs()
    expect(urls.some((u) => u.includes('/store') || u.includes('/urunlerimiz'))).toBe(false)
  })

  it('e-commerce store keeps /store and its product URL, and gains nothing under /urunlerimiz', async () => {
    state.row = row('ecommerce', 'ecommerce')
    const urls = await locs()
    expect(urls).toContain('https://parity.gloval.site/store')
    expect(urls).toContain('https://parity.gloval.site/store/cay')
    expect(urls.some((u) => u.includes('/urunlerimiz'))).toBe(false)
  })
})
