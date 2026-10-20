import { beforeEach, describe, expect, it, vi } from 'vitest'

type Op = { table: string; op: 'select' | 'insert' | 'update' | 'upsert' | 'delete'; payload?: unknown; options?: unknown; filters: Array<[string, unknown]> }

const mocks = vi.hoisted(() => ({
  getAdminUser: vi.fn(),
  checkLimit: vi.fn(),
  audit: vi.fn(),
  respond: vi.fn(),
  ops: [] as unknown[],
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
vi.mock('@/lib/content/blog', () => ({ BLOG_CACHE_TAG: 'platform-blog' }))
vi.mock('@/lib/mail/admin-guard', () => ({ getAdminUser: mocks.getAdminUser }))
vi.mock('@/lib/blog-admin-limit', () => ({ checkBlogAdminLimit: mocks.checkLimit }))
vi.mock('@/lib/blog-audit', () => ({ recordBlogAudit: mocks.audit }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const state: Op = { table, op: 'select', filters: [] }
      const run = () => {
        mocks.ops.push({ ...state })
        return Promise.resolve(mocks.respond(state) ?? { data: null, error: null })
      }
      const builder: Record<string, unknown> = {
        select: () => builder,
        insert: (payload: unknown) => ((state.op = 'insert'), (state.payload = payload), builder),
        update: (payload: unknown) => ((state.op = 'update'), (state.payload = payload), builder),
        upsert: (payload: unknown, options: unknown) => ((state.op = 'upsert'), (state.payload = payload), (state.options = options), builder),
        delete: () => ((state.op = 'delete'), builder),
        eq: (column: string, value: unknown) => (state.filters.push([column, value]), builder),
        maybeSingle: run,
        single: run,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => run().then(resolve, reject),
      }
      return builder
    },
  }),
}))

import {
  deleteCategoryAction,
  deletePostAction,
  savePostAction,
  saveCategoryAction,
  setPostStatusAction,
} from './actions'
import { emptyEnglish, type PostInput } from '@/lib/blog-admin-shared'

const ops = () => mocks.ops as Op[]
const writes = () => ops().filter((o) => o.op !== 'select')

const input = (overrides: Partial<PostInput> = {}): PostInput => ({
  title: 'Merhaba dünya',
  slug: 'merhaba-dunya',
  excerpt: '',
  body: 'İçerik burada.',
  categoryId: null,
  tags: [],
  coverUrl: '',
  coverAlt: '',
  seoTitle: '',
  metaDescription: '',
  status: 'draft',
  publishedAt: null,
  authorName: 'GLOVAL AI',
  noindex: false,
  featured: false,
  en: emptyEnglish(),
  ...overrides,
})

describe('blog admin actions', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => Array.isArray(mock) || mock.mockReset())
    mocks.ops.length = 0
    mocks.getAdminUser.mockResolvedValue({ userId: 'u-1', email: 'admin@example.com' })
    mocks.checkLimit.mockResolvedValue({ allowed: true })
    mocks.audit.mockResolvedValue(undefined)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('authorization', () => {
    it('rejects every action for a non-admin without touching the database', async () => {
      mocks.getAdminUser.mockResolvedValue(null)
      const results = await Promise.all([
        savePostAction(input()),
        setPostStatusAction('p-1', 'published'),
        deletePostAction('p-1'),
        saveCategoryAction({ name: 'Genel', slug: 'genel', description: '', sortOrder: 0 }),
        deleteCategoryAction('c-1'),
      ])
      for (const result of results) expect(result).toEqual({ ok: false, error: 'unauthorized' })
      expect(ops()).toHaveLength(0)
      expect(mocks.checkLimit).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()
    })

    it('returns rate_limited and writes nothing when the write limit is exhausted', async () => {
      mocks.checkLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 10 })
      await expect(savePostAction(input())).resolves.toEqual({ ok: false, error: 'rate_limited' })
      expect(ops()).toHaveLength(0)
    })
  })

  describe('slug change', () => {
    const existing = { slug: 'eski-adres', status: 'published' }

    it('records the old slug so it redirects permanently to the new one', async () => {
      mocks.respond.mockImplementation((state: Op) =>
        state.table === 'platform_blog_posts' && state.op === 'select' ? { data: existing, error: null } : { data: null, error: null },
      )
      const result = await savePostAction(input({ id: 'p-1', slug: 'yeni-adres', status: 'published' }))
      expect(result).toMatchObject({ ok: true, id: 'p-1', slug: 'yeni-adres' })
      const redirect = writes().find((o) => o.table === 'platform_blog_redirects' && o.op === 'upsert')
      expect(redirect?.payload).toEqual({ old_slug: 'eski-adres', post_id: 'p-1' })
      expect(redirect?.options).toEqual({ onConflict: 'old_slug' })
      expect(mocks.audit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'post.update', detail: expect.objectContaining({ previousSlug: 'eski-adres' }) }),
      )
    })

    it('clears a stale redirect that points away from the slug being taken', async () => {
      mocks.respond.mockImplementation((state: Op) =>
        state.table === 'platform_blog_posts' && state.op === 'select' ? { data: existing, error: null } : { data: null, error: null },
      )
      await savePostAction(input({ id: 'p-1', slug: 'yeni-adres', status: 'published' }))
      const cleanup = writes().find((o) => o.table === 'platform_blog_redirects' && o.op === 'delete')
      expect(cleanup?.filters).toEqual([['old_slug', 'yeni-adres']])
    })

    it('does not create a redirect when the slug is unchanged', async () => {
      mocks.respond.mockImplementation((state: Op) =>
        state.table === 'platform_blog_posts' && state.op === 'select'
          ? { data: { slug: 'merhaba-dunya', status: 'draft' }, error: null }
          : { data: null, error: null },
      )
      await savePostAction(input({ id: 'p-1' }))
      expect(writes().some((o) => o.table === 'platform_blog_redirects')).toBe(false)
    })

    it('reports slug_taken on a unique violation', async () => {
      mocks.respond.mockImplementation((state: Op) =>
        state.table === 'platform_blog_posts' && state.op === 'insert'
          ? { data: null, error: { code: '23505', message: 'duplicate' } }
          : { data: null, error: null },
      )
      await expect(savePostAction(input())).resolves.toMatchObject({ ok: false, error: 'slug_taken' })
    })
  })

  describe('publishing with empty content', () => {
    it('refuses to save a published post with an empty body', async () => {
      const result = await savePostAction(input({ status: 'published', body: '   ' }))
      expect(result).toMatchObject({ ok: false, error: 'validation', errors: { body: 'required_to_publish' } })
      expect(writes()).toHaveLength(0)
    })

    it('refuses to publish an existing post whose body is empty, leaving it untouched', async () => {
      mocks.respond.mockImplementation((state: Op) =>
        state.op === 'select' ? { data: { slug: 's', title: 'T', published_at: null, body: '  \n ' }, error: null } : { data: null, error: null },
      )
      const result = await setPostStatusAction('p-1', 'published')
      expect(result).toMatchObject({ ok: false, error: 'validation', errors: { body: 'required_to_publish' } })
      expect(writes()).toHaveLength(0)
      expect(mocks.audit).not.toHaveBeenCalled()
    })

    it('publishes a post that has content and stamps the publish time', async () => {
      mocks.respond.mockImplementation((state: Op) =>
        state.op === 'select' ? { data: { slug: 's', title: 'T', published_at: null, body: 'Metin.' }, error: null } : { data: null, error: null },
      )
      await expect(setPostStatusAction('p-1', 'published')).resolves.toEqual({ ok: true })
      const update = writes().find((o) => o.op === 'update')
      expect(update?.payload).toMatchObject({ status: 'published' })
      expect(typeof (update?.payload as { published_at: string }).published_at).toBe('string')
      expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'post.publish' }))
    })

    it('allows unpublishing an empty post back to draft', async () => {
      mocks.respond.mockImplementation((state: Op) =>
        state.op === 'select' ? { data: { slug: 's', title: 'T', published_at: '2026-01-01T00:00:00Z', body: '' }, error: null } : { data: null, error: null },
      )
      await expect(setPostStatusAction('p-1', 'draft')).resolves.toEqual({ ok: true })
    })
  })

  describe('category deletion', () => {
    const withPosts = (count: number, targetExists = true) =>
      mocks.respond.mockImplementation((state: Op) => {
        if (state.table === 'platform_blog_posts' && state.op === 'select') return { data: null, count, error: null }
        if (state.table === 'platform_blog_categories' && state.op === 'select') return { data: targetExists ? { id: 'c-2' } : null, error: null }
        return { data: null, error: null }
      })

    it('blocks deleting a category that has posts when no target is given', async () => {
      withPosts(3)
      await expect(deleteCategoryAction('c-1')).resolves.toEqual({ ok: false, error: 'category_in_use', count: 3 })
      expect(writes()).toHaveLength(0)
      expect(mocks.audit).not.toHaveBeenCalled()
    })

    it('moves the posts to the chosen category before deleting, so none are left uncategorized', async () => {
      withPosts(3)
      await expect(deleteCategoryAction('c-1', 'c-2')).resolves.toEqual({ ok: true, moved: 3 })
      const [move, remove] = writes()
      expect(move).toMatchObject({ table: 'platform_blog_posts', op: 'update', payload: { category_id: 'c-2' }, filters: [['category_id', 'c-1']] })
      expect(remove).toMatchObject({ table: 'platform_blog_categories', op: 'delete', filters: [['id', 'c-1']] })
      expect(mocks.audit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'category.delete', detail: { id: 'c-1', moved: 3, movedTo: 'c-2' } }),
      )
    })

    it('rejects moving posts into the category being deleted', async () => {
      withPosts(2)
      await expect(deleteCategoryAction('c-1', 'c-1')).resolves.toMatchObject({ ok: false, error: 'validation' })
      expect(writes()).toHaveLength(0)
    })

    it('rejects a move target that does not exist and deletes nothing', async () => {
      withPosts(2, false)
      await expect(deleteCategoryAction('c-1', 'ghost')).resolves.toMatchObject({ ok: false, error: 'not_found' })
      expect(writes()).toHaveLength(0)
    })

    it('does not delete the category if moving the posts fails', async () => {
      mocks.respond.mockImplementation((state: Op) => {
        if (state.table === 'platform_blog_posts' && state.op === 'select') return { data: null, count: 2, error: null }
        if (state.table === 'platform_blog_categories' && state.op === 'select') return { data: { id: 'c-2' }, error: null }
        if (state.table === 'platform_blog_posts' && state.op === 'update') return { data: null, error: { message: 'boom' } }
        return { data: null, error: null }
      })
      await expect(deleteCategoryAction('c-1', 'c-2')).resolves.toMatchObject({ ok: false, error: 'failed' })
      expect(writes().some((o) => o.op === 'delete')).toBe(false)
    })

    it('deletes an empty category directly without touching posts', async () => {
      withPosts(0)
      await expect(deleteCategoryAction('c-1')).resolves.toEqual({ ok: true, moved: 0 })
      expect(writes().map((o) => `${o.table}:${o.op}`)).toEqual(['platform_blog_categories:delete'])
    })
  })

  it('deletes a post and records its slug and title in the audit trail', async () => {
    mocks.respond.mockImplementation((state: Op) =>
      state.op === 'select' ? { data: { slug: 'silinen', title: 'Silinen' }, error: null } : { data: null, error: null },
    )
    await expect(deletePostAction('p-1')).resolves.toEqual({ ok: true })
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'post.delete', postId: 'p-1', postSlug: 'silinen', postTitle: 'Silinen' }),
    )
  })
})
