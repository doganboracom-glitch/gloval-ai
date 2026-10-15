import { describe, expect, it, vi } from 'vitest'
import { BLOG_MAX_POSTS, type BlogPost } from '@/lib/blog'
import type { BlogAiOutput } from '@/lib/blog-ai'
import {
  blogOperationSchema,
  executeBlogOperation,
  parseBlogInstruction,
  type BlogOperationArgs,
} from '@/lib/blog-operations'
import { runBlogPersonalize, runBlogWrite, type BlogRunDeps } from '@/lib/blog-run'
import type { BlogRecord, BlogStore } from '@/lib/blog-write'

const NOW = new Date('2026-03-10T12:00:00Z')
const MINE = 'project-mine'
const OTHER = 'project-other'
const USER = 'user-1'
const ANSWERS = { offering: 'Diş beyazlatma', region: 'Kadıköy' }

const output: BlogAiOutput = {
  title: 'Diş beyazlatma hakkında bilmeniz gerekenler',
  excerpt: 'Diş beyazlatmanın nasıl çalıştığını ve nelere dikkat edilmesi gerektiğini anlatan kısa rehber.',
  seoTitle: 'Diş beyazlatma rehberi',
  metaDescription:
    'Diş beyazlatma işleminin nasıl yapıldığını, kimlere uygun olduğunu ve sonrasında nelere dikkat edilmesi gerektiğini öğrenin.',
  keywords: ['diş beyazlatma', 'diş bakımı', 'gülüş'],
  coverAlt: 'Diş hekimi koltuğunda gülümseyen hasta',
  body: '## Giriş\n\nBu yazı genel bilgi içindir.\n\n## Nasıl yapılır\n\nAdım adım ilerler.\n\n## Sonuç\n\nUzmanınıza danışın.',
}

function post(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'p1',
    slug: 'ornek-yazi',
    title: 'Örnek yazı',
    excerpt: null,
    body: 'Örnek içerik.',
    keywords: [],
    seoTitle: null,
    metaDescription: null,
    coverUrl: null,
    coverAlt: null,
    status: 'draft',
    indexable: false,
    publishedAt: null,
    aiGenerated: false,
    personalized: false,
    sample: true,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

/** Posts are scoped by project, exactly like the real store. */
function scopedStore(seed: Array<[string, BlogPost]> = [], forcedCount?: number) {
  const posts = new Map(seed.map(([project, value]) => [`${project}:${value.id}`, value]))
  let next = 1
  const inProject = (project: string) => [...posts.entries()].filter(([key]) => key.startsWith(`${project}:`))
  const store: BlogStore = {
    count: async (project) => forcedCount ?? inProject(project).length,
    slugs: async (project) => inProject(project).map(([, value]) => value.slug),
    get: async (project, id) => posts.get(`${project}:${id}`) ?? null,
    insert: async (project, record: BlogRecord) => {
      const created: BlogPost = { ...record, id: `new-${next++}`, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }
      posts.set(`${project}:${created.id}`, created)
      return created
    },
    update: async (project, id, record) => {
      const prev = posts.get(`${project}:${id}`)!
      const updated: BlogPost = { ...record, id, createdAt: prev.createdAt, updatedAt: NOW.toISOString() }
      posts.set(`${project}:${id}`, updated)
      return updated
    },
    remove: async (project, id) => void posts.delete(`${project}:${id}`),
  }
  return { store, posts, ids: (project: string) => inProject(project).map(([, value]) => value.id) }
}

type Harness = ReturnType<typeof harness>

function harness(
  options: {
    seed?: Array<[string, BlogPost]>
    balance?: number
    generate?: BlogRunDeps['generate']
    chargeOk?: boolean
    ledger?: string[]
    count?: number
    suspended?: boolean
  } = {},
) {
  const db = scopedStore(options.seed, options.count)
  const ledger = new Set(options.ledger ?? [])
  let balance = options.balance ?? 10
  const generate = vi.fn(options.generate ?? (async () => output))
  const charge = vi.fn(async (reason: string) => {
    if (options.chargeOk === false) return { ok: false, balance }
    balance -= 3
    ledger.add(reason)
    return { ok: true, balance }
  })
  const deps: BlogRunDeps = {
    write: {
      store: db.store,
      suspended: async () => options.suspended ?? false,
      enqueue: vi.fn(async () => 1),
      now: () => NOW,
    },
    cost: 3,
    balance: async () => balance,
    charge,
    alreadyCharged: async (reason) => ledger.has(reason),
    generate,
    inflight: new Set<string>(),
  }
  return { deps, db, generate, charge, balance: () => balance }
}

const write = (h: Harness, requestId = 'req-1', topic = 'Diş beyazlatma') =>
  runBlogWrite(h.deps, { userId: USER, projectId: MINE, requestId, topic, answers: ANSWERS })

describe('runBlogWrite credits', () => {
  it('charges exactly 3 credits, once, and only after the draft is stored', async () => {
    const h = harness()
    const result = await write(h)
    expect(result).toMatchObject({ ok: true, charged: 3, balance: 7 })
    expect(h.charge).toHaveBeenCalledTimes(1)
    expect(h.charge).toHaveBeenCalledWith('blogWrite:req-1')
    expect(h.db.ids(MINE)).toHaveLength(1)
    if (result.ok) {
      expect(result.post).toMatchObject({ status: 'draft', aiGenerated: true, personalized: true })
    }
  })

  it.each([
    ['a model failure', () => Promise.reject(new Error('boom'))],
    ['a timeout', () => Promise.reject(new DOMException('The operation timed out', 'TimeoutError'))],
    ['a schema failure', () => Promise.reject(new Error('No object generated: response did not match schema'))],
  ])('does not charge or store anything on %s', async (_label, fail) => {
    const h = harness({ generate: fail })
    const result = await write(h)
    expect(result).toMatchObject({ ok: false, status: 502, error: 'generation_failed' })
    expect(h.charge).not.toHaveBeenCalled()
    expect(h.balance()).toBe(10)
    expect(h.db.ids(MINE)).toHaveLength(0)
  })

  it('refuses without calling the model when the balance is below 3', async () => {
    const h = harness({ balance: 2 })
    expect(await write(h)).toMatchObject({ ok: false, status: 402, balance: 2 })
    expect(h.generate).not.toHaveBeenCalled()
    expect(h.charge).not.toHaveBeenCalled()
  })

  it('removes the stored draft when the charge is declined', async () => {
    const h = harness({ chargeOk: false })
    expect(await write(h)).toMatchObject({ ok: false, status: 402 })
    expect(h.db.ids(MINE)).toHaveLength(0)
  })

  it('does not charge when the post cannot be stored (500 post cap)', async () => {
    const h = harness({ count: BLOG_MAX_POSTS })
    expect(await write(h)).toMatchObject({ ok: false, status: 409, error: 'POST_LIMIT' })
    expect(h.charge).not.toHaveBeenCalled()
    expect(h.db.ids(MINE)).toHaveLength(0)
  })

  it('bills a double click once: the concurrent twin is refused', async () => {
    let release!: (value: BlogAiOutput) => void
    const gate = new Promise<BlogAiOutput>((resolve) => (release = resolve))
    const h = harness({ generate: () => gate })
    const first = write(h)
    const second = write(h)
    expect(await second).toMatchObject({ ok: false, status: 409, error: 'duplicate' })
    release(output)
    expect(await first).toMatchObject({ ok: true, charged: 3 })
    expect(h.charge).toHaveBeenCalledTimes(1)
    expect(h.generate).toHaveBeenCalledTimes(1)
    expect(h.db.ids(MINE)).toHaveLength(1)
    expect(h.balance()).toBe(7)
  })

  it('refuses a retried request id that the ledger already holds', async () => {
    const h = harness({ ledger: ['blogWrite:req-1'] })
    expect(await write(h)).toMatchObject({ ok: false, status: 409, error: 'duplicate' })
    expect(h.generate).not.toHaveBeenCalled()
    expect(h.charge).not.toHaveBeenCalled()
  })

  it('rolls back when another instance charged the same id mid-flight', async () => {
    const h = harness()
    h.generate.mockImplementation(async () => {
      h.deps.alreadyCharged = async () => true
      return output
    })
    expect(await write(h)).toMatchObject({ ok: false, status: 409, error: 'duplicate' })
    expect(h.charge).not.toHaveBeenCalled()
    expect(h.db.ids(MINE)).toHaveLength(0)
  })

  it('lets a new request id through after a completed one', async () => {
    const h = harness()
    await write(h, 'req-1')
    expect(await write(h, 'req-2')).toMatchObject({ ok: true })
    expect(h.charge).toHaveBeenCalledTimes(2)
  })

  it('passes the owner answers to the model and marks answer-less posts as not personalized', async () => {
    const h = harness()
    await write(h)
    expect(h.generate).toHaveBeenCalledWith({ topic: 'Diş beyazlatma', answers: ANSWERS })

    const bare = harness()
    const result = await runBlogWrite(bare.deps, { userId: USER, projectId: MINE, requestId: 'r', topic: 'Konu', answers: {} })
    expect(result.ok && result.post.personalized).toBe(false)
  })
})

describe('runBlogPersonalize', () => {
  const args = (overrides: Partial<Parameters<typeof runBlogPersonalize>[1]> = {}) => ({
    userId: USER,
    projectId: MINE,
    postId: 'p1',
    requestId: 'req-p',
    answers: ANSWERS,
    confirmed: true,
    ...overrides,
  })

  it('turns a sample draft into the owner own post, charging 3 once', async () => {
    const h = harness({ seed: [[MINE, post()]] })
    const result = await runBlogPersonalize(h.deps, args())
    expect(result).toMatchObject({ ok: true, charged: 3, balance: 7 })
    expect(h.charge).toHaveBeenCalledWith('blogPersonalize:req-p')
    expect(result.ok && result.post).toMatchObject({ personalized: true, sample: false, indexable: true })
    expect(h.generate).toHaveBeenCalledWith({ topic: 'Örnek yazı', answers: ANSWERS, draft: 'Örnek içerik.' })
  })

  it('needs the owner confirmation and real business answers before anything runs', async () => {
    const h = harness({ seed: [[MINE, post()]] })
    expect(await runBlogPersonalize(h.deps, args({ confirmed: false }))).toMatchObject({ status: 400 })
    expect(await runBlogPersonalize(h.deps, args({ answers: { offering: '  ' } }))).toMatchObject({ status: 422 })
    expect(h.generate).not.toHaveBeenCalled()
    expect(h.charge).not.toHaveBeenCalled()
  })

  it('does not charge and keeps the draft when generation fails', async () => {
    const h = harness({ seed: [[MINE, post()]], generate: async () => Promise.reject(new Error('timeout')) })
    expect(await runBlogPersonalize(h.deps, args())).toMatchObject({ ok: false, status: 502 })
    expect(h.charge).not.toHaveBeenCalled()
    expect(h.db.posts.get(`${MINE}:p1`)).toMatchObject({ sample: true, personalized: false, indexable: false })
  })

  it('restores the previous content when the charge is declined', async () => {
    const h = harness({ seed: [[MINE, post()]], chargeOk: false })
    expect(await runBlogPersonalize(h.deps, args())).toMatchObject({ ok: false, status: 402 })
    expect(h.db.posts.get(`${MINE}:p1`)).toMatchObject({ title: 'Örnek yazı', sample: true, personalized: false, indexable: false })
  })

  it('refuses a post that is already personalized', async () => {
    const h = harness({ seed: [[MINE, post({ personalized: true, sample: false })]] })
    expect(await runBlogPersonalize(h.deps, args())).toMatchObject({ ok: false, status: 409, error: 'ALREADY_PERSONALIZED' })
    expect(h.charge).not.toHaveBeenCalled()
  })

  it('bills a double click once', async () => {
    let release!: (value: BlogAiOutput) => void
    const gate = new Promise<BlogAiOutput>((resolve) => (release = resolve))
    const h = harness({ seed: [[MINE, post()]], generate: () => gate })
    const first = runBlogPersonalize(h.deps, args())
    await Promise.resolve()
    const second = runBlogPersonalize(h.deps, args())
    expect(await second).toMatchObject({ ok: false, status: 409, error: 'duplicate' })
    release(output)
    expect(await first).toMatchObject({ ok: true })
    expect(h.charge).toHaveBeenCalledTimes(1)
  })

  it('denies access to another project post', async () => {
    const h = harness({ seed: [[OTHER, post({ id: 'theirs' })]] })
    const result = await runBlogPersonalize(h.deps, args({ postId: 'theirs' }))
    expect(result).toMatchObject({ ok: false, status: 404, error: 'NOT_FOUND' })
    expect(h.generate).not.toHaveBeenCalled()
    expect(h.charge).not.toHaveBeenCalled()
    expect(h.db.posts.get(`${OTHER}:theirs`)).toMatchObject({ sample: true, personalized: false })
  })
})

describe('executeBlogOperation', () => {
  const base = (h: Harness, overrides: Partial<BlogOperationArgs> = {}): BlogOperationArgs => ({
    userId: USER,
    projectId: MINE,
    requestId: 'req-op',
    operation: { op: 'createPost', topic: 'Diş beyazlatma' },
    profile: ANSWERS,
    confirmed: true,
    posts: [...h.db.posts.values()],
    ...overrides,
  })

  it('never spends credits without the owner confirmation', async () => {
    const h = harness({ seed: [[MINE, post()]] })
    for (const operation of [
      { op: 'createPost', topic: 'Diş beyazlatma' },
      { op: 'personalizePost' },
    ] as const) {
      expect(await executeBlogOperation(h.deps, base(h, { operation, confirmed: false }))).toMatchObject({
        ok: false,
        status: 400,
        error: 'confirmation_required',
      })
    }
    expect(h.generate).not.toHaveBeenCalled()
    expect(h.charge).not.toHaveBeenCalled()
  })

  it('createPost charges 3 on success through the shared flow', async () => {
    const h = harness()
    expect(await executeBlogOperation(h.deps, base(h))).toMatchObject({ ok: true, charged: 3 })
    expect(h.charge).toHaveBeenCalledTimes(1)
  })

  it('personalizePost picks the newest sample draft and needs saved business answers', async () => {
    const h = harness({ seed: [[MINE, post()]] })
    const noAnswers = await executeBlogOperation(
      h.deps,
      base(h, { operation: { op: 'personalizePost' }, profile: {} }),
    )
    expect(noAnswers).toMatchObject({ ok: false, status: 422, error: 'answers_required' })
    const done = await executeBlogOperation(h.deps, base(h, { operation: { op: 'personalizePost' } }))
    expect(done).toMatchObject({ ok: true, charged: 3 })
    expect(done.ok && done.post.personalized).toBe(true)
  })

  it('setPostStatus is free and publishes an owner-confirmed post', async () => {
    const own = post({ id: 'own', sample: false, personalized: true, indexable: true })
    const h = harness({ seed: [[MINE, own]] })
    const result = await executeBlogOperation(
      h.deps,
      base(h, { operation: { op: 'setPostStatus', status: 'published' }, confirmed: false }),
    )
    expect(result).toMatchObject({ ok: true, charged: 0 })
    expect(result.ok && result.post.status).toBe('published')
    expect(h.charge).not.toHaveBeenCalled()
  })

  it('setPostStatus never publishes a sample post or skips the subscription gate', async () => {
    const sample = harness({ seed: [[MINE, post()]] })
    expect(
      await executeBlogOperation(sample.deps, base(sample, { operation: { op: 'setPostStatus', status: 'published' } })),
    ).toMatchObject({ ok: false, status: 409, error: 'sample_content' })
    expect(sample.db.posts.get(`${MINE}:p1`)?.status).toBe('draft')

    const own = post({ sample: false, personalized: true })
    const suspended = harness({ seed: [[MINE, own]], suspended: true })
    expect(
      await executeBlogOperation(suspended.deps, base(suspended, { operation: { op: 'setPostStatus', status: 'published' } })),
    ).toMatchObject({ ok: false, status: 409, error: 'suspended' })
  })

  it('refuses a post id that belongs to another project', async () => {
    const h = harness({ seed: [[OTHER, post({ id: 'theirs', sample: false, personalized: true })]] })
    // Even if the id slips into the list, the project-scoped store does not know it.
    const result = await executeBlogOperation(
      h.deps,
      base(h, {
        operation: { op: 'setPostStatus', status: 'published', postId: 'theirs' },
        posts: [...h.db.posts.values()],
      }),
    )
    expect(result).toMatchObject({ ok: false, status: 404, error: 'NOT_FOUND' })
    expect(h.db.posts.get(`${OTHER}:theirs`)?.status).toBe('draft')
  })

  it('answers 404 for a post id missing from the project list', async () => {
    const h = harness({ seed: [[MINE, post({ sample: false, personalized: true })]] })
    expect(
      await executeBlogOperation(h.deps, base(h, { operation: { op: 'setPostStatus', status: 'draft', postId: 'nope' } })),
    ).toMatchObject({ ok: false, status: 404 })
  })
})

describe('blog instruction parsing', () => {
  it('recognises create, personalize and status instructions, and ignores site edits', () => {
    expect(parseBlogInstruction('Diş beyazlatma hakkında bir blog yazısı yaz')).toEqual({
      op: 'createPost',
      topic: 'Diş beyazlatma',
    })
    expect(parseBlogInstruction('blog yazımı firmama özelleştir')).toEqual({ op: 'personalizePost' })
    expect(parseBlogInstruction('blog yazısını yayınla')).toMatchObject({ op: 'setPostStatus', status: 'published' })
    expect(parseBlogInstruction('blog yazısını taslağa al')).toMatchObject({ op: 'setPostStatus', status: 'draft' })
    expect(parseBlogInstruction('sayfayı yayınla')).toBeNull()
    expect(parseBlogInstruction('başlığı mavi yap')).toBeNull()
  })

  it('rejects malformed operations', () => {
    expect(blogOperationSchema.safeParse({ op: 'createPost', topic: 'a' }).success).toBe(false)
    expect(blogOperationSchema.safeParse({ op: 'deleteEverything' }).success).toBe(false)
    expect(blogOperationSchema.safeParse({ op: 'setPostStatus', status: 'scheduled' }).success).toBe(false)
  })
})
