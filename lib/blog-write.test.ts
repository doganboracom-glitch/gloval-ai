import { describe, expect, it, vi } from 'vitest'
import { BLOG_MAX_POSTS, type BlogPost } from '@/lib/blog'
import { detectUnverifiedClaims } from '@/lib/blog-trust'
import {
  createBlogPost,
  deleteBlogPost,
  safeCoverUrl,
  updateBlogPost,
  type BlogRecord,
  type BlogStore,
  type BlogWriteDeps,
} from '@/lib/blog-write'

const NOW = new Date('2026-03-10T12:00:00Z')
const PROJECT = 'project-1'

function memoryStore(initial: BlogPost[] = [], count?: number) {
  const posts = new Map(initial.map((post) => [post.id, post]))
  let next = 1
  const store: BlogStore = {
    count: async () => count ?? posts.size,
    slugs: async () => [...posts.values()].map((post) => post.slug),
    get: async (_project, id) => posts.get(id) ?? null,
    insert: async (_project, record: BlogRecord) => {
      const post: BlogPost = { ...record, id: `new-${next++}`, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }
      posts.set(post.id, post)
      return post
    },
    update: async (_project, id, record) => {
      const prev = posts.get(id)!
      const post: BlogPost = { ...record, id, createdAt: prev.createdAt, updatedAt: NOW.toISOString() }
      posts.set(id, post)
      return post
    },
    remove: async (_project, id) => void posts.delete(id),
  }
  return { store, posts }
}

function deps(overrides: Partial<BlogWriteDeps> & { initial?: BlogPost[]; count?: number } = {}) {
  const { store, posts } = memoryStore(overrides.initial, overrides.count)
  const enqueue = vi.fn(async () => 1)
  const value: BlogWriteDeps = {
    store,
    suspended: async () => false,
    enqueue,
    now: () => NOW,
    ...overrides,
  }
  return { deps: value, enqueue, posts }
}

function existing(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'p1',
    slug: 'ilk-yazi',
    title: 'İlk yazı',
    excerpt: null,
    body: 'Merhaba dünya.',
    keywords: [],
    seoTitle: null,
    metaDescription: null,
    coverUrl: null,
    coverAlt: null,
    status: 'published',
    indexable: true,
    publishedAt: '2026-03-01T00:00:00Z',
    aiGenerated: false,
    personalized: true,
    sample: false,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

const input = (overrides: Record<string, unknown> = {}) => ({
  title: 'Yeni yazı',
  body: 'Düz bir metin.',
  status: 'published',
  ...overrides,
})

describe('createBlogPost', () => {
  it('rejects malformed input and blank titles', async () => {
    const { deps: d } = deps()
    expect(await createBlogPost(d, PROJECT, { nope: true })).toMatchObject({ ok: false, reason: 'INVALID', field: 'input' })
    expect(await createBlogPost(d, PROJECT, input({ title: '   ' }))).toMatchObject({ ok: false, reason: 'INVALID', field: 'title' })
  })

  it('enforces the per-project post cap', async () => {
    const { deps: d } = deps({ count: BLOG_MAX_POSTS })
    expect(await createBlogPost(d, PROJECT, input())).toMatchObject({ ok: false, reason: 'POST_LIMIT', limit: BLOG_MAX_POSTS })
  })

  it('gives colliding titles a unique slug', async () => {
    const { deps: d } = deps({ initial: [existing({ slug: 'yeni-yazi' })] })
    const result = await createBlogPost(d, PROJECT, input())
    expect(result.ok && result.post.slug).not.toBe('yeni-yazi')
    expect(result.ok && result.post.slug.startsWith('yeni-yazi')).toBe(true)
  })

  it('queues IndexNow only for a post that is live now', async () => {
    const live = deps()
    await createBlogPost(live.deps, PROJECT, input())
    expect(live.enqueue).toHaveBeenCalledWith(PROJECT, [expect.any(String)], 'blog:publish')

    const draft = deps()
    await createBlogPost(draft.deps, PROJECT, input({ status: 'draft' }))
    expect(draft.enqueue).not.toHaveBeenCalled()

    const scheduled = deps()
    const result = await createBlogPost(scheduled.deps, PROJECT, input({ publishAt: '2026-04-01T00:00:00Z' }))
    expect(result.ok && result.post.status).toBe('published')
    expect(scheduled.enqueue).not.toHaveBeenCalled()
  })

  it('does not let a failing queue fail the write', async () => {
    const { deps: d } = deps({ enqueue: async () => Promise.reject(new Error('down')) })
    expect((await createBlogPost(d, PROJECT, input())).ok).toBe(true)
  })

  it('blocks publishing for a suspended subscription but still saves drafts', async () => {
    const { deps: d } = deps({ suspended: async () => true })
    expect(await createBlogPost(d, PROJECT, input())).toMatchObject({ ok: false, reason: 'SUBSCRIPTION_SUSPENDED' })
    expect((await createBlogPost(d, PROJECT, input({ status: 'draft' }))).ok).toBe(true)
  })

  it('refuses unverified claims until each is approved, then publishes', async () => {
    const body = 'Müşterilerimizin %90 memnun kaldı.'
    const findings = detectUnverifiedClaims(body)
    expect(findings.length).toBeGreaterThan(0)

    const { deps: d, enqueue } = deps()
    const refused = await createBlogPost(d, PROJECT, input({ body }))
    expect(refused).toMatchObject({ ok: false, reason: 'SAMPLE_CONTENT', samplePost: false })
    expect(enqueue).not.toHaveBeenCalled()

    const approved = await createBlogPost(d, PROJECT, input({ body, approvals: findings.map((f) => f.id) }))
    expect(approved.ok).toBe(true)
  })

  it('keeps claims out of drafts', async () => {
    const { deps: d } = deps()
    expect((await createBlogPost(d, PROJECT, input({ body: 'Yüzde 90 memnuniyet.', status: 'draft' }))).ok).toBe(true)
  })

  it('holds sample posts back until the owner confirms them', async () => {
    const { deps: d } = deps()
    const refused = await createBlogPost(d, PROJECT, input(), { sample: true })
    expect(refused).toMatchObject({ ok: false, reason: 'SAMPLE_CONTENT', samplePost: true })

    const draft = await createBlogPost(d, PROJECT, input({ status: 'draft' }), { sample: true })
    expect(draft.ok && draft.post.sample).toBe(true)

    const confirmed = await createBlogPost(d, PROJECT, input({ confirmSample: true }), { sample: true })
    expect(confirmed.ok && confirmed.post.sample).toBe(false)
  })

  it('takes provenance from the server, not the client payload', async () => {
    const { deps: d } = deps()
    const result = await createBlogPost(d, PROJECT, input({ aiGenerated: true, sample: true, personalized: true }))
    expect(result.ok && result.post).toMatchObject({ aiGenerated: false, sample: false, personalized: false })
  })

  it('drops unsafe cover URLs and caps keywords', async () => {
    const { deps: d } = deps()
    const result = await createBlogPost(
      d,
      PROJECT,
      input({ coverUrl: 'javascript:alert(1)', keywords: Array.from({ length: 30 }, (_, i) => `kelime-${i}`) }),
    )
    expect(result.ok && result.post.coverUrl).toBeNull()
    expect(result.ok && result.post.keywords).toHaveLength(10)
  })
})

describe('safeCoverUrl', () => {
  it('allows https and site-relative paths only', () => {
    expect(safeCoverUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg')
    expect(safeCoverUrl('/images/a.jpg')).toBe('/images/a.jpg')
    expect(safeCoverUrl('//evil.example.com/a.jpg')).toBeNull()
    expect(safeCoverUrl('http://example.com/a.jpg')).toBeNull()
    expect(safeCoverUrl('data:image/png;base64,AAAA')).toBeNull()
    expect(safeCoverUrl('')).toBeNull()
  })
})

describe('updateBlogPost', () => {
  it('returns NOT_FOUND for unknown posts', async () => {
    const { deps: d } = deps()
    expect(await updateBlogPost(d, PROJECT, 'missing', input())).toMatchObject({ ok: false, reason: 'NOT_FOUND' })
  })

  it('keeps the slug and publish date of a live post and pings it as an update', async () => {
    const { deps: d, enqueue } = deps({ initial: [existing()] })
    const result = await updateBlogPost(d, PROJECT, 'p1', input({ title: 'Başlık değişti' }))
    expect(result.ok && result.post).toMatchObject({ slug: 'ilk-yazi', publishedAt: '2026-03-01T00:00:00Z' })
    expect(enqueue).toHaveBeenCalledWith(PROJECT, ['ilk-yazi'], 'blog:update')
  })

  it('pings both the old and new slug when a live post is renamed', async () => {
    const { deps: d, enqueue } = deps({ initial: [existing()] })
    await updateBlogPost(d, PROJECT, 'p1', input({ slug: 'yeni-adres' }))
    expect(enqueue).toHaveBeenCalledWith(PROJECT, ['ilk-yazi', 'yeni-adres'], 'blog:update')
  })

  it('pings an unpublish when a live post goes back to draft', async () => {
    const { deps: d, enqueue } = deps({ initial: [existing()] })
    await updateBlogPost(d, PROJECT, 'p1', input({ status: 'draft' }))
    expect(enqueue).toHaveBeenCalledWith(PROJECT, ['ilk-yazi'], 'blog:unpublish')
  })

  it('does not ping while a post stays a draft', async () => {
    const { deps: d, enqueue } = deps({ initial: [existing({ status: 'draft', publishedAt: null })] })
    await updateBlogPost(d, PROJECT, 'p1', input({ status: 'draft' }))
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('treats a first publish of a draft as a publish ping', async () => {
    const { deps: d, enqueue } = deps({ initial: [existing({ status: 'draft', publishedAt: null })] })
    const result = await updateBlogPost(d, PROJECT, 'p1', input())
    expect(result.ok && result.post.publishedAt).toBe(NOW.toISOString())
    expect(enqueue).toHaveBeenCalledWith(PROJECT, ['ilk-yazi'], 'blog:publish')
  })
})

describe('deleteBlogPost', () => {
  it('removes the post and pings only when it was live', async () => {
    const live = deps({ initial: [existing()] })
    expect(await deleteBlogPost(live.deps, PROJECT, 'p1')).toEqual({ ok: true })
    expect(live.posts.size).toBe(0)
    expect(live.enqueue).toHaveBeenCalledWith(PROJECT, ['ilk-yazi'], 'blog:delete')

    const draft = deps({ initial: [existing({ status: 'draft', publishedAt: null })] })
    await deleteBlogPost(draft.deps, PROJECT, 'p1')
    expect(draft.enqueue).not.toHaveBeenCalled()
  })

  it('returns NOT_FOUND for unknown posts', async () => {
    const { deps: d } = deps()
    expect(await deleteBlogPost(d, PROJECT, 'missing')).toEqual({ ok: false, reason: 'NOT_FOUND' })
  })
})
