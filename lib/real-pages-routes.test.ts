import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { fallbackWebsite, type WebsiteSchema } from '@/lib/website-schema'
import { materializePages } from '@/lib/website-pages'

const state = vi.hoisted(() => ({
  site: null as null | { name: string; schema: unknown; ownerPlanCode: string },
  origin: 'https://kahve.gloval.site',
  boundDomain: null as null | { websiteProjectId: string },
  boundSlug: null as null | string,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'kahve.gloval.site' }),
}))
vi.mock('@/lib/commerce-mode-server', () => ({
  getPublishedSiteCommerceMode: async () => 'none',
  getPublishedSiteRouting: async () => ({ id: null, mode: 'none', projectType: null, catalogPaths: false }),
  getCatalogContext: async () => ({ mode: 'none', whatsappNumber: null, origin: state.origin }),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  permanentRedirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))
vi.mock('@/lib/projects', () => ({ getPublishedSite: async () => state.site }))
vi.mock('@/lib/store', () => ({ getStoreProducts: async () => [], getStoreCollections: async () => [] }))
vi.mock('@/lib/store-shipping-settings', () => ({ getStoreShippingInfo: async () => null }))
vi.mock('@/lib/project-entitlements', () => ({ isSiteBrandingRemoved: async () => false }))
vi.mock('@/lib/store-payment-badges', () => ({ getStorePaymentBadges: async () => null }))
vi.mock('@/lib/site-contact-guard', () => ({ contactSecret: () => null, signContactToken: () => '' }))
vi.mock('@/lib/seo/site-seo', () => ({
  getSiteSeoContext: async () => ({ origin: state.origin, lastModified: '2026-01-01T00:00:00.000Z' }),
}))
vi.mock('@/components/website-renderer/website-renderer', () => ({ WebsiteRenderer: () => null }))
vi.mock('@/lib/supabase/proxy', () => ({ updateSession: async () => NextResponse.next() }))
vi.mock('@/lib/custom-domains/service', () => ({
  resolveActiveDomainForHost: async () => state.boundDomain,
  getPublishedSlugForProjectId: async () => state.boundSlug,
}))

import { buildSitePageMetadata, PublicSiteView } from '@/components/site/public-site-view'
import { GET as sitemapGET } from '@/app/site/[slug]/sitemap.xml/route'
import { middleware } from '@/middleware'

function publishedSite(extra: Partial<WebsiteSchema> = {}): WebsiteSchema {
  const base = fallbackWebsite('kahve dükkanı', 'tr')
  return materializePages({
    ...base,
    pages: [
      { slug: 'home', title: 'Ana Sayfa', isHome: true },
      { slug: 'hakkimizda', title: 'Hakkımızda', seo: { title: 'Biz Kimiz', description: 'Hikayemiz' } },
      { slug: 'gizli', title: 'Gizli', indexable: false },
    ] as WebsiteSchema['pages'],
    ...extra,
  })
}

beforeEach(() => {
  state.site = { name: 'Kahve', schema: publishedSite(), ownerPlanCode: 'free' }
  state.origin = 'https://kahve.gloval.site'
  state.boundDomain = null
  state.boundSlug = null
})

const request = (host: string, path: string) =>
  new NextRequest(`https://${host}${path}`, { headers: { host } })

describe('route resolution (middleware)', () => {
  it('subdomain: /<page> is rewritten to /site/<slug>/<page>, / to /site/<slug>', async () => {
    const page = await middleware(request('kahve.gloval.site', '/hakkimizda'))
    expect(page.headers.get('x-middleware-rewrite')).toContain('/site/kahve/hakkimizda')
    const home = await middleware(request('kahve.gloval.site', '/'))
    expect(home.headers.get('x-middleware-rewrite')).toMatch(/\/site\/kahve$/)
  })

  it('custom domain: a bound, published domain serves the same page routes', async () => {
    state.boundDomain = { websiteProjectId: 'p1' }
    state.boundSlug = 'kahve'
    const res = await middleware(request('www.kahvecim.com.tr', '/hakkimizda'))
    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/kahve/hakkimizda')
  })

  it('custom domain: an unbound domain is not rewritten', async () => {
    const res = await middleware(request('www.baska-alan.com', '/hakkimizda'))
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it('/site/<slug>/<page> on the platform host is served as-is', async () => {
    const res = await middleware(request('gloval.ai', '/site/kahve/hakkimizda'))
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    expect(res.status).toBeLessThan(300)
  })
})

describe('real page rendering: 404 and 301', () => {
  it('renders a known page and the home page', async () => {
    await expect(PublicSiteView({ slug: 'kahve', pageSlug: 'hakkimizda' })).resolves.toBeTruthy()
    await expect(PublicSiteView({ slug: 'kahve', pageSlug: null })).resolves.toBeTruthy()
  })

  it('answers 404 for an unknown page instead of a copy of the home page', async () => {
    await expect(PublicSiteView({ slug: 'kahve', pageSlug: 'yok-boyle-bir-sayfa' })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('answers 404 for /home (the home page lives at /)', async () => {
    await expect(PublicSiteView({ slug: 'kahve', pageSlug: 'home' })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('answers 404 (not-found boundary shows the notice) for a site that is not published', async () => {
    state.site = null
    await expect(PublicSiteView({ slug: 'kahve', pageSlug: null })).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(PublicSiteView({ slug: 'kahve', pageSlug: 'hakkimizda' })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('permanently redirects the old slug of a renamed page', async () => {
    state.site = {
      name: 'Kahve',
      schema: publishedSite({ pageRedirects: [{ from: '/biz-kimiz-eski', to: '/hakkimizda' }] }),
      ownerPlanCode: 'free',
    }
    await expect(PublicSiteView({ slug: 'kahve', pageSlug: 'biz-kimiz-eski' })).rejects.toThrow(
      'NEXT_REDIRECT:/hakkimizda',
    )
  })

  it('does not redirect when the target page no longer exists', async () => {
    state.site = {
      name: 'Kahve',
      schema: publishedSite({ pageRedirects: [{ from: '/eski', to: '/silinmis' }] }),
      ownerPlanCode: 'free',
    }
    await expect(PublicSiteView({ slug: 'kahve', pageSlug: 'eski' })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('canonical, Open Graph and robots per page', () => {
  it('uses the site origin for the home page', async () => {
    const meta = await buildSitePageMetadata('kahve', null)
    expect(meta.alternates?.canonical).toBe('https://kahve.gloval.site')
    expect(meta.robots).toMatchObject({ index: true })
  })

  it('uses the page path, page SEO and the custom-domain origin', async () => {
    state.origin = 'https://kahvecim.com.tr'
    const meta = await buildSitePageMetadata('kahve', 'hakkimizda')
    expect(meta.alternates?.canonical).toBe('https://kahvecim.com.tr/hakkimizda')
    expect(meta.openGraph).toMatchObject({ url: 'https://kahvecim.com.tr/hakkimizda', title: 'Biz Kimiz' })
    expect(meta.title).toBe('Biz Kimiz')
    expect(meta.description).toBe('Hikayemiz')
  })

  it('marks a non-indexable page noindex and never canonicals to gloval.ai', async () => {
    const meta = await buildSitePageMetadata('kahve', 'gizli')
    expect(meta.robots).toMatchObject({ index: false })
    expect(String(meta.alternates?.canonical)).not.toContain('gloval.ai')
  })

  it('does not describe an unknown page as a real one', async () => {
    const meta = await buildSitePageMetadata('kahve', 'yok')
    expect(meta.robots).toMatchObject({ index: false })
    expect(meta.alternates).toBeUndefined()
  })
})

describe('tenant sitemap', () => {
  const locs = async () => {
    const res = await sitemapGET(new Request('https://kahve.gloval.site/sitemap.xml'), {
      params: Promise.resolve({ slug: 'kahve' }),
    })
    expect(res.status).toBe(200)
    const xml = await res.text()
    return { xml, locs: Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1]) }
  }

  it('lists home plus indexable pages on the site origin, with lastmod', async () => {
    const { xml, locs: urls } = await locs()
    expect(urls).toEqual(['https://kahve.gloval.site', 'https://kahve.gloval.site/hakkimizda'])
    expect(xml).toContain('<lastmod>2026-01-01T00:00:00.000Z</lastmod>')
    expect(xml).not.toContain('/site/')
  })

  it('uses the custom domain origin and leaves out noindex pages', async () => {
    state.origin = 'https://kahvecim.com.tr'
    const { locs: urls } = await locs()
    expect(urls).toContain('https://kahvecim.com.tr/hakkimizda')
    expect(urls.some((u) => u.endsWith('/gizli'))).toBe(false)
  })

  it('updates page URLs after a slug change and never includes unpublished or noindex pages', async () => {
    state.site = {
      name: 'Kahve',
      schema: publishedSite({
        pages: [
          { slug: 'home', title: 'Ana Sayfa', isHome: true },
          { slug: 'biz-kimiz', title: 'Biz Kimiz', indexable: true },
          { slug: 'taslak', title: 'Taslak', indexable: false },
        ] as WebsiteSchema['pages'],
      }),
      ownerPlanCode: 'free',
    }
    const { locs: urls } = await locs()

    expect(urls).toContain('https://kahve.gloval.site/biz-kimiz')
    expect(urls).not.toContain('https://kahve.gloval.site/hakkimizda')
    expect(urls).not.toContain('https://kahve.gloval.site/taslak')
  })

  it('keeps legal pages out of the sitemap', async () => {
    state.site = {
      name: 'Kahve',
      schema: publishedSite({
        pages: [
          { slug: 'home', title: 'Ana Sayfa', isHome: true },
          { slug: 'gizlilik', title: 'Gizlilik', kind: 'legal', indexable: false },
        ] as WebsiteSchema['pages'],
      }),
      ownerPlanCode: 'free',
    }
    const { locs: urls } = await locs()
    expect(urls).toEqual(['https://kahve.gloval.site'])
  })
})
