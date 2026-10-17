import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeClient, type Tables } from '@/lib/__fixtures__/fake-supabase'
import { fallbackWebsite } from '@/lib/website-schema'

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  userId: 'owner-1' as string | null,
  email: 'o@test.dev',
  admin: false,
}))
const scheduleStarterBlog = vi.hoisted(() => vi.fn())
const runStarterBlogNow = vi.hoisted(() => vi.fn())

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/mail/admin-guard', () => ({ isAdminEmail: () => state.admin }))
vi.mock('@/lib/billing', () => ({ getMyCurrentPlan: vi.fn(), getPlanCodeForUser: async () => 'free' }))
vi.mock('@/lib/effective-limits', () => ({ getEffectiveSiteLimit: vi.fn(), getEffectiveProductLimit: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true, retryAfterMs: 0 }) }))
vi.mock('@/lib/billing-lifecycle', () => ({ isSubscriptionSuspended: vi.fn() }))
vi.mock('@/lib/store-sync', () => ({ syncStoreFromSchema: vi.fn() }))
vi.mock('@/lib/starter-blog-server', () => ({ scheduleStarterBlog, runStarterBlogNow }))
vi.mock('@/lib/blog-store', () => ({ createBlogWriteDeps: vi.fn(), listProjectBlogPosts: vi.fn() }))
vi.mock('@/lib/content-attestations', () => ({
  loadAttestedDigests: vi.fn(),
  recordAttestations: vi.fn(),
  selectApproved: vi.fn(),
}))
vi.mock('@/lib/custom-domains/provider', () => ({ getDomainProvider: vi.fn() }))
vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeClient } = await import('@/lib/__fixtures__/fake-supabase')
  return { createAdminClient: () => createFakeClient(state.tables as Tables) }
})
vi.mock('@/lib/supabase/server', async () => {
  const { createFakeClient } = await import('@/lib/__fixtures__/fake-supabase')
  return {
    createClient: async () => ({
      auth: {
        getUser: async () => ({
          data: { user: state.userId ? { id: state.userId, email: state.email } : null },
        }),
      },
      ...createFakeClient(state.tables as Tables, {
        // RLS stand-in: a session only sees its own projects.
        visible: (table, row) => (table === 'projects' && !state.admin ? row.owner_id === state.userId : true),
      }),
    }),
  }
})

import { createProject } from '@/lib/projects'
import { addStarterBlogPostsAction } from '@/lib/blog-actions'

beforeEach(() => {
  state.tables = { projects: [] }
  state.userId = 'owner-1'
  state.admin = false
  scheduleStarterBlog.mockReset()
  runStarterBlogNow.mockReset()
})

describe('starter blog after project creation', () => {
  it('createProject stores the site in projects.schema_data (never a `data` column)', async () => {
    const schema = fallbackWebsite('diş kliniği için kurumsal site', 'tr')
    await createProject({ name: schema.meta.name, schema })
    const row = state.tables.projects[0]
    expect(row).toHaveProperty('schema_data')
    expect(row).not.toHaveProperty('data')
    expect((row.schema_data as { meta: { name: string } }).meta.name).toBe(schema.meta.name)
  })

  it('schedules the starter posts once, with the new project id, owner and site facts', async () => {
    const schema = fallbackWebsite('diş kliniği için kurumsal site', 'tr')
    const id = await createProject({ name: schema.meta.name, schema })
    expect(scheduleStarterBlog).toHaveBeenCalledTimes(1)
    expect(scheduleStarterBlog).toHaveBeenCalledWith({
      projectId: id,
      ownerId: 'owner-1',
      siteSlug: null,
      site: { name: schema.meta.name, description: schema.meta.description, storefront: false },
      lang: 'tr',
    })
  })

  it('a store is flagged storefront so it gets ecommerce topics', async () => {
    const schema = fallbackWebsite('e-ticaret sitesi oluştur, ayakkabı satan online mağaza', 'tr')
    await createProject({ name: schema.meta.name, schema })
    const call = scheduleStarterBlog.mock.calls[0][0]
    const hasStore = schema.sections.some((s) => s.type === 'products' || s.type === 'categories')
    expect(call.site.storefront).toBe(hasStore)
  })

  it('an English site schedules English posts', async () => {
    const schema = fallbackWebsite('dental clinic corporate website', 'en')
    await createProject({ name: schema.meta.name, schema, language: 'en' })
    expect(scheduleStarterBlog.mock.calls[0][0].lang).toBe('en')
  })

  it('anonymous visitors never trigger generation and no project is written', async () => {
    state.userId = null
    const schema = fallbackWebsite('diş kliniği için kurumsal site', 'tr')
    await expect(createProject({ name: schema.meta.name, schema })).rejects.toThrow('UNAUTHENTICATED')
    expect(scheduleStarterBlog).not.toHaveBeenCalled()
    expect(state.tables.projects).toHaveLength(0)
  })

  it('a failed project insert does not schedule generation', async () => {
    state.tables = {}
    const schema = fallbackWebsite('diş kliniği için kurumsal site', 'tr')
    const original = state.tables
    Object.defineProperty(original, 'projects', {
      get() {
        throw new Error('db down')
      },
      configurable: true,
    })
    await expect(createProject({ name: schema.meta.name, schema })).rejects.toThrow()
    expect(scheduleStarterBlog).not.toHaveBeenCalled()
  })
})

describe('"Örnek blog yazılarını ekle" button action', () => {
  function seedProject(overrides: Record<string, unknown> = {}) {
    const schema = fallbackWebsite('diş kliniği için kurumsal site', 'tr')
    state.tables = {
      projects: [
        {
          id: 'p1',
          owner_id: 'owner-1',
          slug: 'klinik',
          name: 'Klinik',
          language: 'tr',
          schema_data: schema,
          ...overrides,
        },
      ],
    }
    return schema
  }

  it('reads the site from projects.schema_data and hands it to the runner', async () => {
    const schema = seedProject()
    runStarterBlogNow.mockResolvedValue({ status: 'created', posts: [{ id: 'a' }], failed: 2 })
    const result = await addStarterBlogPostsAction('p1')
    expect(result).toEqual({ ok: true, posts: [{ id: 'a' }], failed: 2 })
    expect(runStarterBlogNow).toHaveBeenCalledWith({
      projectId: 'p1',
      ownerId: 'owner-1',
      siteSlug: 'klinik',
      site: { name: schema.meta.name, description: schema.meta.description, storefront: false },
      lang: 'tr',
    })
  })

  it('falls back to the project name when schema_data is not a valid site', async () => {
    seedProject({ schema_data: { broken: true } })
    runStarterBlogNow.mockResolvedValue({ status: 'skipped', reason: 'already_added' })
    await addStarterBlogPostsAction('p1')
    expect(runStarterBlogNow.mock.calls[0][0].site).toEqual({ name: 'Klinik', description: '', storefront: false })
  })

  it('passes English through', async () => {
    seedProject({ language: 'en' })
    runStarterBlogNow.mockResolvedValue({ status: 'skipped', reason: 'already_added' })
    await addStarterBlogPostsAction('p1')
    expect(runStarterBlogNow.mock.calls[0][0].lang).toBe('en')
  })

  it.each(['already_added', 'in_progress'] as const)('maps skipped/%s to a refusal', async (reason) => {
    seedProject()
    runStarterBlogNow.mockResolvedValue({ status: 'skipped', reason })
    expect(await addStarterBlogPostsAction('p1')).toEqual({ ok: false, reason })
  })

  it.each([
    'starter_blog_limit',
    'starter_blog_post_limit',
    'starter_blog_db',
    'starter_blog_model',
    'starter_blog_timeout',
    'starter_blog_suspended',
  ] as const)('maps the %s failure code through unchanged', async (code) => {
    seedProject()
    runStarterBlogNow.mockResolvedValue({ status: 'failed', failed: 3, code })
    expect(await addStarterBlogPostsAction('p1')).toEqual({ ok: false, reason: code })
  })

  it('anonymous: UNAUTHENTICATED and nothing is generated', async () => {
    seedProject()
    state.userId = null
    expect(await addStarterBlogPostsAction('p1')).toEqual({ ok: false, reason: 'UNAUTHENTICATED' })
    expect(runStarterBlogNow).not.toHaveBeenCalled()
  })

  it("someone else's project: NOT_FOUND and nothing is generated", async () => {
    seedProject({ owner_id: 'someone-else' })
    expect(await addStarterBlogPostsAction('p1')).toEqual({ ok: false, reason: 'NOT_FOUND' })
    expect(runStarterBlogNow).not.toHaveBeenCalled()
  })
})
