import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const updateSession = vi.fn(async (_request: NextRequest) => NextResponse.next())
const resolveActiveDomainForHost = vi.fn()
const getPublishedSlugForProjectId = vi.fn()

vi.mock('@/lib/supabase/proxy', () => ({ updateSession: (req: NextRequest) => updateSession(req) }))
vi.mock('@/lib/custom-domains/service', () => ({
  resolveActiveDomainForHost: (host: string) => resolveActiveDomainForHost(host),
  getPublishedSlugForProjectId: (id: string) => getPublishedSlugForProjectId(id),
}))

import { middleware } from '@/middleware'

const KEY = 'ab12'.repeat(8)

function req(host: string, path: string) {
  return new NextRequest(`https://${host}${path}`, { headers: { host } })
}

type Outcome =
  | { kind: 'rewrite'; path: string }
  | { kind: 'redirect'; status: number; location: string }
  | { kind: 'next' }
  | { kind: 'session' }

async function run(host: string, path: string): Promise<Outcome> {
  updateSession.mockClear()
  const res = await middleware(req(host, path))
  const rewrite = res.headers.get('x-middleware-rewrite')
  if (rewrite) {
    const url = new URL(rewrite)
    return { kind: 'rewrite', path: url.pathname + url.search }
  }
  const location = res.headers.get('location')
  if (location) return { kind: 'redirect', status: res.status, location }
  if (updateSession.mock.calls.length > 0) return { kind: 'session' }
  return { kind: 'next' }
}

beforeEach(() => {
  updateSession.mockClear()
  resolveActiveDomainForHost.mockReset()
  getPublishedSlugForProjectId.mockReset()
  resolveActiveDomainForHost.mockResolvedValue({ websiteProjectId: 'p1' })
  getPublishedSlugForProjectId.mockResolvedValue('dbajans')
})

describe('middleware: unchanged behaviour', () => {
  describe('tenant subdomain <slug>.gloval.site', () => {
    const host = 'dbajans.gloval.site'

    it.each([
      ['/', '/site/dbajans'],
      ['/hakkimizda', '/site/dbajans/hakkimizda'],
      ['/iletisim', '/site/dbajans/iletisim'],
      ['/yasal/gizlilik', '/site/dbajans/yasal/gizlilik'],
      ['/blog', '/site/dbajans/blog'],
      ['/blog/ilk-yazi', '/site/dbajans/blog/ilk-yazi'],
      ['/blog/rss.xml', '/site/dbajans/blog/rss.xml'],
      ['/store/urun-1', '/site/dbajans/store/urun-1'],
      ['/sitemap.xml', '/site/dbajans/sitemap.xml'],
      ['/robots.txt', '/site/dbajans/robots.txt'],
      ['/api/anything', '/site/dbajans/api/anything'],
      ['/not-a-key.txt', '/site/dbajans/not-a-key.txt'],
      [`/${KEY.toUpperCase()}.txt`, `/site/dbajans/${KEY.toUpperCase()}.txt`],
      [`/${KEY.slice(1)}.txt`, `/site/dbajans/${KEY.slice(1)}.txt`],
      [`/${KEY}.txt/extra`, `/site/dbajans/${KEY}.txt/extra`],
      [`/blog/${KEY}.txt`, `/site/dbajans/blog/${KEY}.txt`],
    ])('rewrites %s -> %s', async (path, expected) => {
      expect(await run(host, path)).toEqual({ kind: 'rewrite', path: expected })
    })

    it('keeps the query string on rewrites', async () => {
      expect(await run(host, '/blog?sayfa=2')).toEqual({ kind: 'rewrite', path: '/site/dbajans/blog?sayfa=2' })
    })

    it.each(['/api/store/session', '/api/site-contact', '/api/try-on'])('passes %s through untouched', async (path) => {
      expect(await run(host, path)).toEqual({ kind: 'next' })
    })

    it.each([
      ['/api/try-on/', '/site/dbajans/api/try-on/'],
      ['/api/try-on/extra', '/site/dbajans/api/try-on/extra'],
      ['/api/generate', '/site/dbajans/api/generate'],
      ['/api/billing/plan', '/site/dbajans/api/billing/plan'],
    ])('keeps %s off the API surface by rewriting it to %s', async (path, expected) => {
      expect(await run(host, path)).toEqual({ kind: 'rewrite', path: expected })
    })

    it('308-redirects the legacy refund path', async () => {
      const out = await run(host, '/yasal/iptal-ve-iade')
      expect(out).toMatchObject({ kind: 'redirect', status: 308 })
      expect(new URL((out as { location: string }).location).pathname).toBe('/yasal/teslimat-ve-iade')
    })

    it('does not rewrite paths that already start with /site/', async () => {
      expect(await run(host, '/site/dbajans/hakkimizda')).toEqual({ kind: 'session' })
    })

    it('never consults the custom-domain tables', async () => {
      await run(host, '/hakkimizda')
      expect(resolveActiveDomainForHost).not.toHaveBeenCalled()
    })
  })

  describe('bound custom domain', () => {
    const host = 'www.dbajans.com.tr'

    it.each([
      ['/', '/site/dbajans'],
      ['/hakkimizda', '/site/dbajans/hakkimizda'],
      ['/yasal/gizlilik', '/site/dbajans/yasal/gizlilik'],
      ['/blog', '/site/dbajans/blog'],
      ['/blog/rss.xml', '/site/dbajans/blog/rss.xml'],
      ['/sitemap.xml', '/site/dbajans/sitemap.xml'],
      ['/robots.txt', '/site/dbajans/robots.txt'],
      ['/not-a-key.txt', '/site/dbajans/not-a-key.txt'],
    ])('rewrites %s -> %s', async (path, expected) => {
      expect(await run(host, path)).toEqual({ kind: 'rewrite', path: expected })
      expect(resolveActiveDomainForHost).toHaveBeenCalledWith(host)
      expect(getPublishedSlugForProjectId).toHaveBeenCalledWith('p1')
    })

    it.each(['/api/store/session', '/api/site-contact', '/api/try-on'])('passes %s through without a lookup', async (path) => {
      expect(await run(host, path)).toEqual({ kind: 'next' })
      expect(resolveActiveDomainForHost).not.toHaveBeenCalled()
    })

    it('308-redirects the legacy refund path without a lookup', async () => {
      expect(await run(host, '/yasal/iptal-ve-iade')).toMatchObject({ kind: 'redirect', status: 308 })
      expect(resolveActiveDomainForHost).not.toHaveBeenCalled()
    })

    it('falls through to the auth flow when the domain is not bound', async () => {
      resolveActiveDomainForHost.mockResolvedValue(null)
      expect(await run(host, '/hakkimizda')).toEqual({ kind: 'session' })
    })

    it('falls through to the auth flow when the bound site is unpublished', async () => {
      getPublishedSlugForProjectId.mockResolvedValue(null)
      expect(await run(host, '/hakkimizda')).toEqual({ kind: 'session' })
    })

    it('does not rewrite paths that already start with /site/', async () => {
      expect(await run(host, '/site/dbajans')).toEqual({ kind: 'session' })
      expect(resolveActiveDomainForHost).not.toHaveBeenCalled()
    })
  })

  describe('platform hosts', () => {
    it.each([
      ['gloval.ai', '/'],
      ['gloval.ai', '/dashboard'],
      ['gloval.ai', '/dashboard/projeler'],
      ['gloval.ai', '/editor/abc'],
      ['gloval.ai', '/api/generate'],
      ['gloval.ai', '/api/cron/domain-reconciliation'],
      ['gloval.ai', '/sitemap.xml'],
      ['gloval.ai', '/robots.txt'],
      ['gloval.ai', '/site/dbajans/hakkimizda'],
      ['gloval.ai', '/site/dbajans/blog'],
      ['gloval.ai', `/${KEY}.txt`],
      ['localhost:3000', '/dashboard'],
      ['localhost:3000', `/${KEY}.txt`],
      ['my-preview.vercel.app', '/dashboard'],
      ['my-preview.vercel.app', `/${KEY}.txt`],
    ])('%s%s goes through the auth flow, never rewritten', async (host, path) => {
      expect(await run(host, path)).toEqual({ kind: 'session' })
      expect(resolveActiveDomainForHost).not.toHaveBeenCalled()
    })

    it.each([
      ['www.gloval.ai', '/dashboard?x=1', 'https://gloval.ai/dashboard?x=1'],
      ['www.gloval.ai', '/', 'https://gloval.ai/'],
      ['gloval.site', '/hakkimizda', 'https://gloval.ai/hakkimizda'],
      ['www.gloval.site', '/sitemap.xml', 'https://gloval.ai/sitemap.xml'],
    ])('%s%s 308-redirects to the canonical host', async (host, path, expected) => {
      expect(await run(host, path)).toEqual({ kind: 'redirect', status: 308, location: expected })
    })
  })
})

describe('middleware: IndexNow key file (new behaviour)', () => {
  it('routes /<key>.txt on a tenant subdomain to the key route', async () => {
    expect(await run('dbajans.gloval.site', `/${KEY}.txt`)).toEqual({
      kind: 'rewrite',
      path: `/site/dbajans/indexnow-key/${KEY}`,
    })
  })

  it('routes /<key>.txt on a bound custom domain to the key route', async () => {
    expect(await run('www.dbajans.com.tr', `/${KEY}.txt`)).toEqual({
      kind: 'rewrite',
      path: `/site/dbajans/indexnow-key/${KEY}`,
    })
  })

  it('leaves /<key>.txt on an unbound custom domain to the auth flow', async () => {
    resolveActiveDomainForHost.mockResolvedValue(null)
    expect(await run('www.dbajans.com.tr', `/${KEY}.txt`)).toEqual({ kind: 'session' })
  })
})
