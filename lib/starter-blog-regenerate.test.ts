import { describe, expect, it, vi } from 'vitest'
import { isRegenerableStarterPost, isStarterPost, STARTER_EDIT_GRACE_MS, type BlogPost } from '@/lib/blog'
import type { BlogAiOutput } from '@/lib/blog-ai'
import type { BlogRecord, BlogStore, BlogWriteDeps } from '@/lib/blog-write'
import { regenerateStarterBlog, runStarterBlog, type StarterBlogDeps } from '@/lib/starter-blog'
import { STARTER_POST_COUNT } from '@/lib/starter-blog-topics'

const NOW = new Date('2026-03-10T12:00:00Z')
const PROJECT = 'project-1'
const SITE = { name: 'Aksoy Teknik Servis', description: 'Klima ve kombi servisi', storefront: false }
const args = { projectId: PROJECT, site: SITE, lang: 'tr' as const }

function body(): string {
  const sentence = 'Düzenli bakım ve dikkatli alışkanlıklar günlük hayatı rahatlatır ve işleri kolaylaştırır.'
  const headings = ['## İlk başlık', '## İkinci başlık', '## Üçüncü başlık', '## Dördüncü başlık']
  return headings.map((h) => [h, ...Array.from({ length: 12 }, () => sentence)].join('\n\n')).join('\n\n')
}

function output(title: string): BlogAiOutput {
  return {
    title,
    excerpt: 'Günlük bakım alışkanlıklarını sade ve anlaşılır biçimde anlatan genel bir rehber yazısı.',
    seoTitle: 'Doğru bakım alışkanlıkları rehberi',
    metaDescription:
      'Günlük bakımın temel adımlarını, sık yapılan hataları ve dikkat edilmesi gereken noktaları sade bir dille anlatan genel rehber.',
    keywords: ['bakım', 'rehber', 'alışkanlık'],
    coverAlt: 'Konuyu simgeleyen genel illüstrasyon',
    body: body(),
  }
}

type StoredPost = BlogPost & { sourceKey?: string | null }

/** In-memory store whose `remove` really removes (and frees the unique source key). */
function memoryStore() {
  const posts: StoredPost[] = []
  let next = 1
  const store: BlogStore = {
    count: async () => posts.length,
    slugs: async () => posts.map((p) => p.slug),
    get: async () => null,
    insert: async (_project, record: BlogRecord) => {
      await Promise.resolve()
      if (record.sourceKey && posts.some((p) => p.sourceKey === record.sourceKey)) {
        throw { code: '23505', message: 'duplicate key value violates unique constraint "source_key"' }
      }
      const post: StoredPost = { ...record, id: `post-${next++}`, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }
      posts.push(post)
      return post
    },
    update: async () => {
      throw new Error('not used')
    },
    remove: async (_project, id) => {
      const index = posts.findIndex((p) => p.id === id)
      if (index >= 0) posts.splice(index, 1)
    },
  }
  return { store, posts }
}

function makeDeps(generate?: StarterBlogDeps['generate']) {
  const { store, posts } = memoryStore()
  const write: BlogWriteDeps = { store, suspended: async () => false, enqueue: vi.fn(async () => 1), now: () => NOW }
  let n = 0
  const deps: StarterBlogDeps = {
    write,
    existingStarterCount: async () => posts.filter(isStarterPost).length,
    generate: generate ?? (async () => output(`Yeni teknik servis rehberi ${++n}`)),
    inflight: new Set<string>(),
  }
  return { deps, posts }
}

async function seedStarters() {
  const ctx = makeDeps()
  const seeded = await runStarterBlog(ctx.deps, args)
  expect(seeded.status).toBe('created')
  expect(ctx.posts).toHaveLength(STARTER_POST_COUNT)
  return ctx
}

function ownerPost(base: StoredPost, patch: Partial<StoredPost>): StoredPost {
  return { ...base, id: `owner-${patch.title ?? 'x'}`, sourceKey: null, ...patch }
}

describe('isRegenerableStarterPost', () => {
  const base = { aiGenerated: true, personalized: false, sample: false, indexable: false }
  const created = NOW.toISOString()

  it('accepts an untouched starter post', () => {
    expect(isRegenerableStarterPost({ ...base, createdAt: created, updatedAt: created })).toBe(true)
  })

  it('accepts the system cover upgrade inside the grace window', () => {
    const updated = new Date(NOW.getTime() + STARTER_EDIT_GRACE_MS).toISOString()
    expect(isRegenerableStarterPost({ ...base, createdAt: created, updatedAt: updated })).toBe(true)
  })

  it('rejects a post the owner edited after the grace window', () => {
    const updated = new Date(NOW.getTime() + STARTER_EDIT_GRACE_MS + 1000).toISOString()
    expect(isRegenerableStarterPost({ ...base, createdAt: created, updatedAt: updated })).toBe(false)
  })

  it('rejects personalised, human-written and indexable posts', () => {
    expect(isRegenerableStarterPost({ ...base, personalized: true, createdAt: created, updatedAt: created })).toBe(false)
    expect(isRegenerableStarterPost({ ...base, aiGenerated: false, createdAt: created, updatedAt: created })).toBe(false)
    expect(isRegenerableStarterPost({ ...base, indexable: true, createdAt: created, updatedAt: created })).toBe(false)
  })
})

describe('regenerateStarterBlog', () => {
  it('replaces untouched starters and never touches personalised or edited posts', async () => {
    const { deps, posts } = await seedStarters()
    const [first] = posts
    const personalised = ownerPost(first, { title: 'personalised', personalized: true })
    const edited = ownerPost(first, {
      title: 'edited',
      updatedAt: new Date(NOW.getTime() + STARTER_EDIT_GRACE_MS + 60_000).toISOString(),
    })
    const own = ownerPost(first, { title: 'own', aiGenerated: false })
    posts.push(personalised, edited, own)
    const oldIds = posts.filter((p) => isRegenerableStarterPost(p)).map((p) => p.id)
    expect(oldIds).toHaveLength(STARTER_POST_COUNT)

    const result = await regenerateStarterBlog(deps, { ...args, posts: [...posts], seed: 'seed' })

    expect(result.status).toBe('created')
    for (const id of oldIds) expect(posts.some((p) => p.id === id)).toBe(false)
    expect(posts.filter(isRegenerableStarterPost).filter((p) => !oldIds.includes(p.id))).toHaveLength(STARTER_POST_COUNT)
    for (const kept of [personalised, edited, own]) expect(posts.some((p) => p.id === kept.id)).toBe(true)
  })

  it('skips when there is nothing safe to replace', async () => {
    const { deps, posts } = await seedStarters()
    const protectedPosts = posts.map((p) => ({ ...p, personalized: true }))
    posts.splice(0, posts.length, ...protectedPosts)
    const generate = vi.spyOn(deps, 'generate')

    const result = await regenerateStarterBlog(deps, { ...args, posts: [...posts] })

    expect(result).toEqual({ status: 'skipped', reason: 'nothing_to_replace' })
    expect(generate).not.toHaveBeenCalled()
    expect(posts).toHaveLength(STARTER_POST_COUNT)
  })

  it('puts the old posts back when no replacement could be written', async () => {
    const { deps, posts } = await seedStarters()
    const before = posts.map((p) => p.sourceKey).sort()
    deps.generate = async () => {
      throw new Error('model down')
    }

    const result = await regenerateStarterBlog(deps, { ...args, posts: [...posts] })

    expect(result.status).toBe('failed')
    expect(posts).toHaveLength(STARTER_POST_COUNT)
    expect(posts.map((p) => p.sourceKey).sort()).toEqual(before)
  })
})
