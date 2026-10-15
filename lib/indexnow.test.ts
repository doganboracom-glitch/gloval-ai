import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/seo/site-seo', () => ({ getSiteSeoContext: vi.fn() }))

import {
  INDEXNOW_KEY_ROUTE,
  blogUrls,
  buildIndexNowBody,
  chunk,
  groupByHost,
  indexNowKeyFromPath,
  indexNowKeyLocation,
  isIndexNowAccepted,
  retryDelayMs,
  tenantRewritePath,
} from '@/lib/indexnow'
import { deriveIndexNowKey, enqueueIndexUrls } from '@/lib/indexnow-server'

const KEY = 'a'.repeat(32)

describe('key derivation', () => {
  it('is deterministic, 32 lowercase hex, and per project and secret', () => {
    const a = deriveIndexNowKey('project-1', 'secret')
    expect(a).toMatch(/^[a-f0-9]{32}$/)
    expect(deriveIndexNowKey('project-1', 'secret')).toBe(a)
    expect(deriveIndexNowKey('project-2', 'secret')).not.toBe(a)
    expect(deriveIndexNowKey('project-1', 'other-secret')).not.toBe(a)
    expect(a).not.toContain('project-1')
  })
})

describe('key file routing', () => {
  it('recognises only /<32 hex>.txt', () => {
    expect(indexNowKeyFromPath(`/${KEY}.txt`)).toBe(KEY)
    expect(indexNowKeyFromPath(`/${KEY}.txt/extra`)).toBeNull()
    expect(indexNowKeyFromPath('/robots.txt')).toBeNull()
    expect(indexNowKeyFromPath(`/${'A'.repeat(32)}.txt`)).toBeNull()
    expect(indexNowKeyFromPath(`/${'a'.repeat(31)}.txt`)).toBeNull()
  })

  it('rewrites tenant requests, keeping the key route ahead of page slugs', () => {
    expect(tenantRewritePath('demo', `/${KEY}.txt`)).toBe(`/site/demo/${INDEXNOW_KEY_ROUTE}/${KEY}`)
    expect(tenantRewritePath('demo', '/')).toBe('/site/demo')
    expect(tenantRewritePath('demo', '/blog/yazi')).toBe('/site/demo/blog/yazi')
  })

  it('builds the protocol key location and body', () => {
    expect(indexNowKeyLocation('demo.gloval.site', KEY)).toBe(`https://demo.gloval.site/${KEY}.txt`)
    expect(buildIndexNowBody('demo.gloval.site', KEY, ['https://demo.gloval.site/'])).toEqual({
      host: 'demo.gloval.site',
      key: KEY,
      keyLocation: `https://demo.gloval.site/${KEY}.txt`,
      urlList: ['https://demo.gloval.site/'],
    })
  })
})

describe('queue helpers', () => {
  it('groups due rows per project and host and sets aside non-https URLs', () => {
    const rows = [
      { id: 1, project_id: 'p1', url: 'https://a.example.com/x', attempts: 0 },
      { id: 2, project_id: 'p1', url: 'https://A.example.com/y', attempts: 0 },
      { id: 3, project_id: 'p2', url: 'https://a.example.com/z', attempts: 0 },
      { id: 4, project_id: 'p1', url: 'http://a.example.com/insecure', attempts: 0 },
      { id: 5, project_id: 'p1', url: 'not a url', attempts: 0 },
    ]
    const { groups, invalid } = groupByHost(rows)
    expect(groups.map((g) => [g.projectId, g.host, g.rows.length])).toEqual([
      ['p1', 'a.example.com', 2],
      ['p2', 'a.example.com', 1],
    ])
    expect(invalid.map((r) => r.id)).toEqual([4, 5])
  })

  it('chunks, backs off exponentially with a 24h cap, and accepts only 200/202', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(retryDelayMs(1)).toBe(5 * 60_000)
    expect(retryDelayMs(2)).toBe(20 * 60_000)
    expect(retryDelayMs(50)).toBe(24 * 60 * 60_000)
    expect([200, 202].every(isIndexNowAccepted)).toBe(true)
    expect([204, 400, 403, 422, 429, 500].some(isIndexNowAccepted)).toBe(false)
  })

  it('lists the post, the blog index and the feed for a post change', () => {
    expect(blogUrls('https://demo.gloval.site', ['yazi'])).toEqual([
      'https://demo.gloval.site/blog/yazi',
      'https://demo.gloval.site/blog',
      'https://demo.gloval.site/blog/rss.xml',
    ])
  })
})

describe('enqueueIndexUrls', () => {
  function fakeAdmin() {
    const upsert = vi.fn(async () => ({ error: null }))
    return { admin: { from: vi.fn(() => ({ upsert })) } as never, upsert }
  }

  it('is off without a secret', async () => {
    vi.stubEnv('INDEXNOW_SECRET', '')
    vi.stubEnv('CRON_SECRET', '')
    const { admin, upsert } = fakeAdmin()
    expect(await enqueueIndexUrls('p1', ['https://a.example.com/x'], 'test', admin)).toBe(0)
    expect(upsert).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('dedupes, drops non-https URLs and resets back-off on re-queue', async () => {
    vi.stubEnv('INDEXNOW_SECRET', 'secret')
    const { admin, upsert } = fakeAdmin()
    const queued = await enqueueIndexUrls(
      'p1',
      ['https://a.example.com/x', 'https://a.example.com/x', 'http://a.example.com/y'],
      'blog:publish',
      admin,
    )
    expect(queued).toBe(1)
    expect(upsert).toHaveBeenCalledWith([expect.objectContaining({ url: 'https://a.example.com/x', attempts: 0, reason: 'blog:publish' })], {
      onConflict: 'project_id,url',
    })
    vi.unstubAllEnvs()
  })

  it('swallows queue errors', async () => {
    vi.stubEnv('INDEXNOW_SECRET', 'secret')
    const admin = { from: () => ({ upsert: async () => ({ error: new Error('db down') }) }) } as never
    expect(await enqueueIndexUrls('p1', ['https://a.example.com/x'], 'test', admin)).toBe(0)
    vi.unstubAllEnvs()
  })
})
