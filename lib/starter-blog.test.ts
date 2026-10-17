import { describe, expect, it, vi } from 'vitest'
import { BLOG_MAX_POSTS, isStarterPost, type BlogPost } from '@/lib/blog'
import type { BlogAiOutput } from '@/lib/blog-ai'
import { countWords } from '@/lib/blog-ai'
import type { BlogRecord, BlogStore, BlogWriteDeps } from '@/lib/blog-write'
import {
  findStarterViolations,
  isTimeoutError,
  runStarterBlog,
  STARTER_DAILY_SITE_CAP,
  STARTER_LIMITS,
  starterDailyCapReached,
  starterOutputSchema,
  starterSourceKey,
  type StarterBlogDeps,
  type StarterErrorCode,
} from '@/lib/starter-blog'
import { STARTER_POST_COUNT } from '@/lib/starter-blog-topics'

const NOW = new Date('2026-03-10T12:00:00Z')
const PROJECT = 'project-1'
const SITE = { name: 'Aksoy Diş Kliniği', description: 'Diş sağlığı ve tedavi', storefront: false }

function bodyWith(words: number): string {
  const sentence = 'Düzenli bakım ve dikkatli alışkanlıklar günlük hayatı rahatlatır ve işleri kolaylaştırır.'
  const per = sentence.split(' ').length
  const sections = ['## İlk başlık', '## İkinci başlık', '## Üçüncü başlık', '## Dördüncü başlık']
  const out: string[] = []
  let total = 0
  for (const heading of sections) {
    out.push(heading)
    total += 2
    for (let i = 0; i < Math.ceil((words - 8) / sections.length / per); i++) {
      out.push(sentence)
      total += per
    }
  }
  expect(total).toBeGreaterThan(0)
  return out.join('\n\n')
}

function output(overrides: Partial<BlogAiOutput> = {}): BlogAiOutput {
  return {
    title: 'Ağız bakımında doğru alışkanlıklar',
    excerpt: 'Günlük bakım alışkanlıklarını sade ve anlaşılır biçimde anlatan genel bir rehber yazısı.',
    seoTitle: 'Doğru bakım alışkanlıkları rehberi',
    metaDescription:
      'Günlük bakımın temel adımlarını, sık yapılan hataları ve dikkat edilmesi gereken noktaları sade bir dille anlatan genel rehber.',
    keywords: ['bakım', 'rehber', 'alışkanlık'],
    coverAlt: 'Konuyu simgeleyen genel illüstrasyon',
    body: bodyWith(700),
    ...overrides,
  }
}

type Conflict = { code: string; message: string }

/** In-memory `BlogStore` that models the unique (project_id, source_key) index atomically. */
function memoryStore(options: { count?: number; insertError?: unknown } = {}) {
  const posts: BlogPost[] = []
  const keys = new Set<string>()
  const inserted: BlogRecord[] = []
  let next = 1
  const store: BlogStore = {
    count: async () => options.count ?? posts.length,
    slugs: async () => posts.map((p) => p.slug),
    get: async () => null,
    insert: async (project, record) => {
      await Promise.resolve()
      if (options.insertError) throw options.insertError
      const key = record.sourceKey ? `${project}:${record.sourceKey}` : null
      if (key && keys.has(key)) {
        const conflict: Conflict = { code: '23505', message: 'duplicate key value violates unique constraint "source_key"' }
        throw conflict
      }
      if (key) keys.add(key)
      inserted.push(record)
      const post: BlogPost = { ...record, id: `post-${next++}`, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }
      posts.push(post)
      return post
    },
    update: async () => {
      throw new Error('not used')
    },
    remove: async () => undefined,
  }
  return { store, posts, inserted }
}

function makeDeps(overrides: Partial<StarterBlogDeps> & { suspended?: boolean; count?: number; insertError?: unknown } = {}) {
  const { store, posts, inserted } = memoryStore({ count: overrides.count, insertError: overrides.insertError })
  const enqueue = vi.fn(async () => 1)
  const write: BlogWriteDeps = { store, suspended: async () => overrides.suspended ?? false, enqueue, now: () => NOW }
  const generate = vi.fn(async () => output())
  const deps: StarterBlogDeps = {
    write,
    existingStarterCount: async () => posts.filter(isStarterPost).length,
    generate: overrides.generate ?? generate,
    dailyCapReached: overrides.dailyCapReached,
    inflight: overrides.inflight ?? new Set<string>(),
  }
  if (overrides.existingStarterCount) deps.existingStarterCount = overrides.existingStarterCount
  return { deps, posts, inserted, enqueue, generate }
}

const args = { projectId: PROJECT, site: SITE, lang: 'tr' as const }

describe('fixture sanity', () => {
  it('the generated body passes the starter output schema', () => {
    const body = bodyWith(700)
    expect(countWords(body)).toBeGreaterThanOrEqual(STARTER_LIMITS.minWords)
    expect(countWords(body)).toBeLessThanOrEqual(STARTER_LIMITS.maxWords)
    expect(starterOutputSchema(SITE.name).safeParse(output()).success).toBe(true)
  })

  it('accepts a ~490-word body: the length models really produce (root cause of the empty section)', () => {
    const body = bodyWith(490)
    expect(countWords(body)).toBeLessThan(600)
    expect(starterOutputSchema(SITE.name).safeParse(output({ body })).success).toBe(true)
  })

  it('still rejects bodies that are far too short or too long', () => {
    expect(starterOutputSchema(SITE.name).safeParse(output({ body: bodyWith(150) })).success).toBe(false)
    expect(starterOutputSchema(SITE.name).safeParse(output({ body: bodyWith(1400) })).success).toBe(false)
  })

  it('asks the model for a target range inside the hard limits', () => {
    expect(STARTER_LIMITS.targetMinWords).toBeGreaterThan(STARTER_LIMITS.minWords)
    expect(STARTER_LIMITS.targetMaxWords).toBeLessThan(STARTER_LIMITS.maxWords)
  })
})

describe('runStarterBlog: generation after project creation', () => {
  it('writes exactly three posts, each with its fixed source key', async () => {
    const { deps, inserted } = makeDeps()
    const result = await runStarterBlog(deps, args)
    expect(result.status).toBe('created')
    if (result.status === 'created') {
      expect(result.posts).toHaveLength(STARTER_POST_COUNT)
      expect(result.failed).toBe(0)
    }
    expect(inserted.map((r) => r.sourceKey).sort()).toEqual(
      Array.from({ length: STARTER_POST_COUNT }, (_, i) => starterSourceKey(i)).sort(),
    )
  })

  it('every starter post is noindex, AI-written, not personalised and kept out of IndexNow', async () => {
    const { deps, posts, enqueue } = makeDeps()
    await runStarterBlog(deps, args)
    expect(posts).toHaveLength(STARTER_POST_COUNT)
    for (const post of posts) {
      expect(post.indexable).toBe(false)
      expect(post.aiGenerated).toBe(true)
      expect(post.personalized).toBe(false)
      expect(post.status).toBe('published')
      expect(isStarterPost(post)).toBe(true)
    }
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('a second call never generates again (already_added)', async () => {
    const { deps, generate } = makeDeps()
    await runStarterBlog(deps, args)
    generate.mockClear()
    const again = await runStarterBlog(deps, args)
    expect(again).toEqual({ status: 'skipped', reason: 'already_added' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('a double click in the same process is skipped as in_progress', async () => {
    const inflight = new Set<string>()
    const { deps } = makeDeps({ inflight })
    const [a, b] = await Promise.all([runStarterBlog(deps, args), runStarterBlog(deps, args)])
    const statuses = [a, b].map((r) => (r.status === 'skipped' ? r.reason : r.status)).sort()
    expect(statuses).toEqual(['created', 'in_progress'])
  })
})

describe('runStarterBlog: atomic source_key idempotency', () => {
  it('two concurrent runs with a stale "no starter yet" read still leave exactly three posts', async () => {
    const shared = memoryStore()
    const make = (): StarterBlogDeps => ({
      write: { store: shared.store, suspended: async () => false, enqueue: async () => 0, now: () => NOW },
      existingStarterCount: async () => 0,
      generate: async ({ topic }) => output({ title: `Rehber: ${topic}` }),
      inflight: new Set<string>(),
    })
    const [a, b] = await Promise.all([runStarterBlog(make(), args), runStarterBlog(make(), args)])
    expect(shared.posts).toHaveLength(STARTER_POST_COUNT)
    expect(new Set(shared.posts.map((p) => p.slug)).size).toBe(STARTER_POST_COUNT)
    const created = [a, b].filter((r) => r.status === 'created')
    expect(created.length).toBeGreaterThanOrEqual(1)
    // The loser of the race is never reported as a failure.
    expect([a, b].some((r) => r.status === 'failed')).toBe(false)
  })

  it('losing every insert to the unique index is "already_added", not an error', async () => {
    const shared = memoryStore()
    const deps = (): StarterBlogDeps => ({
      write: { store: shared.store, suspended: async () => false, enqueue: async () => 0, now: () => NOW },
      existingStarterCount: async () => 0,
      generate: async () => output(),
      inflight: new Set<string>(),
    })
    await runStarterBlog(deps(), args)
    const second = await runStarterBlog(deps(), args)
    expect(second).toEqual({ status: 'skipped', reason: 'already_added' })
    expect(shared.posts).toHaveLength(STARTER_POST_COUNT)
  })

  it('different projects do not collide on the same key', async () => {
    const shared = memoryStore()
    const deps = (): StarterBlogDeps => ({
      write: { store: shared.store, suspended: async () => false, enqueue: async () => 0, now: () => NOW },
      existingStarterCount: async () => 0,
      generate: async () => output(),
      inflight: new Set<string>(),
    })
    await runStarterBlog(deps(), { ...args, projectId: 'a' })
    await runStarterBlog(deps(), { ...args, projectId: 'b' })
    expect(shared.posts).toHaveLength(STARTER_POST_COUNT * 2)
  })
})

describe('daily cap', () => {
  it('starterDailyCapReached flips exactly at cap x posts per site', () => {
    const limit = STARTER_DAILY_SITE_CAP * STARTER_POST_COUNT
    expect(starterDailyCapReached(0)).toBe(false)
    expect(starterDailyCapReached(limit - 1)).toBe(false)
    expect(starterDailyCapReached(limit)).toBe(true)
    expect(starterDailyCapReached(limit + 5)).toBe(true)
  })

  it('a reached cap fails with starter_blog_limit and never calls the model', async () => {
    const { deps, generate, posts } = makeDeps({ dailyCapReached: async () => true })
    const result = await runStarterBlog(deps, args)
    expect(result).toEqual({ status: 'failed', failed: STARTER_POST_COUNT, code: 'starter_blog_limit' })
    expect(generate).not.toHaveBeenCalled()
    expect(posts).toHaveLength(0)
  })

  it('an open cap lets the run through', async () => {
    const { deps } = makeDeps({ dailyCapReached: async () => false })
    expect((await runStarterBlog(deps, args)).status).toBe('created')
  })
})

describe('forbidden content', () => {
  const clean = 'Düzenli bakım ve dikkatli alışkanlıklar günlük hayatı kolaylaştırır.'

  it('accepts neutral text', () => {
    expect(findStarterViolations(clean, SITE.name)).toEqual([])
  })

  it.each([
    ['business_name', `${clean} Aksoy Diş Kliniği size yardımcı olur.`],
    ['phone', `${clean} Bizi 0532 123 45 67 numarasından arayın.`],
    ['link', `${clean} Daha fazlası için https://ornek.com adresine bakın.`],
    ['link', `${clean} Yazın: bilgi@ornek.com`],
    ['year', `${clean} Bu yöntem 2019 yılında yaygınlaştı.`],
    ['company_claim', `${clean} 15 yıllık deneyimimizle hizmet veriyoruz.`],
    ['percent', `${clean} Başarı oranı %95 civarındadır.`],
  ])('flags %s', (violation, text) => {
    expect(findStarterViolations(text, SITE.name)).toContain(violation)
  })

  it('the output schema rejects a body that carries a forbidden item', () => {
    const bad = output({ body: `${bodyWith(700)}\n\nBizi 0532 123 45 67 numarasından arayın.` })
    expect(starterOutputSchema(SITE.name).safeParse(bad).success).toBe(false)
  })

  it('the output schema rejects a body that is too short or has too few headings', () => {
    expect(starterOutputSchema(SITE.name).safeParse(output({ body: bodyWith(100) })).success).toBe(false)
    const flat = Array.from({ length: 700 }, () => 'kelime').join(' ')
    expect(starterOutputSchema(SITE.name).safeParse(output({ body: flat })).success).toBe(false)
  })
})

describe('every starter_blog_* error code branch', () => {
  async function codeFor(overrides: Parameters<typeof makeDeps>[0]): Promise<StarterErrorCode | string> {
    const { deps } = makeDeps(overrides)
    const result = await runStarterBlog(deps, args)
    return result.status === 'failed' ? result.code : result.status
  }

  it('starter_blog_limit: daily cap', async () => {
    expect(await codeFor({ dailyCapReached: async () => true })).toBe('starter_blog_limit')
  })

  it('starter_blog_post_limit: the site is full', async () => {
    expect(await codeFor({ count: BLOG_MAX_POSTS })).toBe('starter_blog_post_limit')
  })

  it('starter_blog_suspended: suspended subscription', async () => {
    expect(await codeFor({ suspended: true })).toBe('starter_blog_suspended')
  })

  it('starter_blog_db: the pre-check query throws', async () => {
    expect(
      await codeFor({
        existingStarterCount: async () => {
          throw new Error('db down')
        },
      }),
    ).toBe('starter_blog_db')
  })

  it('starter_blog_db: the daily cap query throws', async () => {
    expect(
      await codeFor({
        dailyCapReached: async () => {
          throw new Error('db down')
        },
      }),
    ).toBe('starter_blog_db')
  })

  it('starter_blog_db: the insert throws a non-conflict error', async () => {
    expect(await codeFor({ insertError: { code: '08006', message: 'connection failure' } })).toBe('starter_blog_db')
  })

  it('starter_blog_model: the model call throws', async () => {
    expect(
      await codeFor({
        generate: async () => {
          throw new Error('bad json')
        },
      }),
    ).toBe('starter_blog_model')
  })

  it('starter_blog_model: the write rules reject the text (empty title)', async () => {
    expect(await codeFor({ generate: async () => output({ title: '   ' }) })).toBe('starter_blog_model')
  })

  it('starter_blog_timeout: the model call times out', async () => {
    const timeout = Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' })
    expect(
      await codeFor({
        generate: async () => {
          throw timeout
        },
      }),
    ).toBe('starter_blog_timeout')
  })

  it('starter_blog_timeout: the whole-run budget aborts a slow model', async () => {
    const { deps } = makeDeps({
      generate: ({ abortSignal } = {} as never) =>
        new Promise((_resolve, reject) => {
          abortSignal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    })
    const result = await runStarterBlog(deps, { ...args, budgetMs: 20 })
    expect(result).toMatchObject({ status: 'failed', code: 'starter_blog_timeout' })
  })

  it('reports the most actionable code when posts fail for different reasons', async () => {
    let call = 0
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    const { deps } = makeDeps({
      generate: async () => {
        call += 1
        if (call === 1) throw timeout
        throw new Error('bad json')
      },
    })
    const result = await runStarterBlog(deps, args)
    expect(result).toMatchObject({ status: 'failed', code: 'starter_blog_timeout' })
  })

  it('a partial success is "created" and counts the failures', async () => {
    let call = 0
    const { deps, posts } = makeDeps({
      generate: async () => {
        call += 1
        if (call === 2) throw new Error('bad json')
        return output()
      },
    })
    const result = await runStarterBlog(deps, args)
    expect(result.status).toBe('created')
    if (result.status === 'created') expect(result.failed).toBe(1)
    expect(posts).toHaveLength(STARTER_POST_COUNT - 1)
  })

  it('never throws, even when a dependency throws synchronously inside generate', async () => {
    const { deps } = makeDeps({
      generate: (() => {
        throw new Error('sync')
      }) as never,
    })
    await expect(runStarterBlog(deps, args)).resolves.toMatchObject({ status: 'failed' })
  })
})

describe('isTimeoutError', () => {
  it('recognises names, messages and an aborted signal', () => {
    expect(isTimeoutError({ name: 'TimeoutError' })).toBe(true)
    expect(isTimeoutError({ name: 'AbortError' })).toBe(true)
    expect(isTimeoutError(new Error('request timed out'))).toBe(true)
    expect(isTimeoutError(new Error('boom'))).toBe(false)
    expect(isTimeoutError(null)).toBe(false)
    const controller = new AbortController()
    controller.abort()
    expect(isTimeoutError(new Error('boom'), controller.signal)).toBe(true)
  })
})
