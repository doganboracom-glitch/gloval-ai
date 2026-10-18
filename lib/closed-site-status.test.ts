import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fallbackWebsite } from '@/lib/website-schema'

const state = vi.hoisted(() => ({
  site: null as null | { name: string; schema: unknown; ownerPlanCode: string },
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  permanentRedirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))
vi.mock('@/lib/projects', () => ({ getPublishedSite: async () => state.site }))
vi.mock('@/lib/seo/site-seo', () => ({
  getSiteSeoContext: async () => ({ origin: 'https://kahve.gloval.site', lastModified: '2026-01-01T00:00:00.000Z' }),
}))
vi.mock('@/lib/blog-server', () => ({
  getLiveBlogPosts: async () => [],
  getSiteBlogData: async () => null,
}))
vi.mock('@/components/site-custom-code', () => ({ SiteCustomCode: () => null }))

import SiteLayout from '@/app/site/[slug]/layout'
import ClosedSiteNotFound, { metadata as closedMetadata } from '@/app/site/not-found'
import { SiteUnpublished } from '@/components/site/site-unpublished'
import { GET as sitemapGET } from '@/app/site/[slug]/sitemap.xml/route'
import { GET as robotsGET } from '@/app/site/[slug]/robots.txt/route'
import { GET as rssGET } from '@/app/site/[slug]/blog/rss.xml/route'
import { closedSiteFileResponse } from '@/lib/site-availability'

const params = { params: Promise.resolve({ slug: 'kahve' }) }
const req = (path: string) => new Request(`https://kahve.gloval.site${path}`)

beforeEach(() => {
  state.site = { name: 'Kahve', schema: fallbackWebsite('kahve dükkanı', 'tr'), ownerPlanCode: 'free' }
})

describe('closed site (unpublished, suspended, deleted): status and indexing', () => {
  it('the layout throws notFound, so every route under the slug answers 404', async () => {
    state.site = null
    await expect(SiteLayout({ children: null, params: params.params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('the 404 boundary renders the notice and is noindex, nofollow', () => {
    expect(ClosedSiteNotFound()).toMatchObject({ type: SiteUnpublished })
    expect(closedMetadata.robots).toMatchObject({ index: false, follow: false })
  })

  it('sitemap.xml is 404 with X-Robots-Tag noindex and lists no URL', async () => {
    state.site = null
    const res = await sitemapGET(req('/sitemap.xml'), params)
    expect(res.status).toBe(404)
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
    expect(await res.text()).not.toContain('<loc>')
  })

  it('robots.txt is 404 and does not Disallow (crawlers must still see the 404)', async () => {
    state.site = null
    const res = await robotsGET(req('/robots.txt'), params)
    expect(res.status).toBe(404)
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
    expect(await res.text()).not.toMatch(/disallow|sitemap/i)
  })

  it('blog RSS is 404 for a closed site', async () => {
    state.site = null
    const res = await rssGET(req('/blog/rss.xml'), params)
    expect(res.status).toBe(404)
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
  })

  it('shared file response is 404, plain text, noindex', () => {
    const res = closedSiteFileResponse()
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })
})

describe('published site is unchanged', () => {
  it('the layout renders its children', async () => {
    await expect(SiteLayout({ children: 'x', params: params.params })).resolves.toBeTruthy()
  })

  it('sitemap.xml answers 200 with the home URL', async () => {
    const res = await sitemapGET(req('/sitemap.xml'), params)
    expect(res.status).toBe(200)
    expect(res.headers.get('x-robots-tag')).toBeNull()
    expect(await res.text()).toContain('<loc>https://kahve.gloval.site</loc>')
  })

  it('robots.txt answers 200 and points at the sitemap', async () => {
    const res = await robotsGET(req('/robots.txt'), params)
    expect(res.status).toBe(200)
    expect(res.headers.get('x-robots-tag')).toBeNull()
    expect(await res.text()).toContain('Sitemap: https://kahve.gloval.site/sitemap.xml')
  })
})
