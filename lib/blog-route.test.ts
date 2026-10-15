import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  project: null as Record<string, unknown> | null,
  consumeCredits: vi.fn(async () => ({ ok: true, balance: 7 })),
  getCreditBalance: vi.fn(async () => 10),
  hasLedgerReason: vi.fn(async () => false),
  generateBlogPost: vi.fn(),
  listPosts: vi.fn(async () => [] as unknown[]),
  adminFrom: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.project }) }) }) }),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.adminFrom }) }))
vi.mock('@/lib/mail/admin-guard', () => ({ isAdminEmail: () => false }))
vi.mock('@/lib/billing', () => ({ getPlanCodeForUser: async () => 'free' }))
vi.mock('@/lib/free-daily-limit', () => ({
  checkFreeDailyActionLimit: async () => ({ allowed: true }),
  freeDailyLimitResponseBody: () => ({ error: 'limit' }),
}))
vi.mock('@/lib/ai-credits', () => ({
  AI_ACTION_COSTS: { blogWrite: 3 },
  consumeCredits: mocks.consumeCredits,
  getCreditBalance: mocks.getCreditBalance,
  hasLedgerReason: mocks.hasLedgerReason,
}))
vi.mock('@/lib/ai-models', () => ({
  resolveAiModel: () => ({ model: 'test/model' }),
  attemptTimeoutMs: () => 1000,
}))
vi.mock('@/lib/ai-structured', () => ({ generateStructured: vi.fn() }))
vi.mock('@/lib/blog-ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/blog-ai')>()),
  generateBlogPost: mocks.generateBlogPost,
}))
vi.mock('@/lib/blog-store', () => ({
  createBlogWriteDeps: () => ({
    store: { count: async () => 0, slugs: async () => [], get: async () => null },
    suspended: async () => false,
    enqueue: async () => 0,
  }),
  listProjectBlogPosts: mocks.listPosts,
}))

import { POST as operationPost } from '@/app/api/blog/operation/route'
import { POST as aiWritePost } from '@/app/api/blog/ai-write/route'
import { POST as personalizePost } from '@/app/api/blog/personalize/route'

const request = (body: unknown) =>
  new Request('http://localhost/api/blog/operation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const operationBody = (overrides: Record<string, unknown> = {}) => ({
  projectId: 'project-1',
  requestId: 'req-12345678',
  operation: { op: 'createPost', topic: 'Diş beyazlatma' },
  confirmed: true,
  ...overrides,
})

beforeEach(() => {
  mocks.user = null
  mocks.project = null
  mocks.consumeCredits.mockClear()
  mocks.generateBlogPost.mockReset()
  mocks.adminFrom.mockClear()
})

describe('/api/blog/operation authorization', () => {
  it('rejects an anonymous caller with 401 and spends nothing', async () => {
    const response = await operationPost(request(operationBody()))
    expect(response.status).toBe(401)
    expect(mocks.generateBlogPost).not.toHaveBeenCalled()
    expect(mocks.consumeCredits).not.toHaveBeenCalled()
  })

  it('rejects a signed-in user who does not own the project with 404', async () => {
    mocks.user = { id: 'intruder', email: 'intruder@example.com' }
    mocks.project = null
    const response = await operationPost(request(operationBody()))
    expect(response.status).toBe(404)
    expect(mocks.adminFrom).not.toHaveBeenCalled()
    expect(mocks.generateBlogPost).not.toHaveBeenCalled()
    expect(mocks.consumeCredits).not.toHaveBeenCalled()
  })

  it('rejects malformed bodies before any auth or model work', async () => {
    mocks.user = { id: 'owner', email: 'owner@example.com' }
    expect((await operationPost(request({ nope: true }))).status).toBe(400)
    expect((await operationPost(request(operationBody({ operation: { op: 'drop' } })))).status).toBe(400)
    expect(mocks.consumeCredits).not.toHaveBeenCalled()
  })

  it('asks the owner to confirm before spending credits, even when authorized', async () => {
    mocks.user = { id: 'owner', email: 'owner@example.com' }
    mocks.project = { id: 'project-1', slug: 'demo', language: 'tr', schema_data: {} }
    const response = await operationPost(request(operationBody({ confirmed: false })))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'confirmation_required' })
    expect(mocks.generateBlogPost).not.toHaveBeenCalled()
    expect(mocks.consumeCredits).not.toHaveBeenCalled()
  })
})

describe('AI blog routes are owner-only too', () => {
  it('ai-write and personalize answer 401 to anonymous callers', async () => {
    const write = await aiWritePost(
      request({ projectId: 'project-1', requestId: 'req-12345678', topic: 'Konu başlığı', answers: {} }),
    )
    const personalize = await personalizePost(
      request({ projectId: 'project-1', postId: 'p1', requestId: 'req-12345678', answers: { region: 'Ankara' }, confirmed: true }),
    )
    expect(write.status).toBe(401)
    expect(personalize.status).toBe(401)
    expect(mocks.consumeCredits).not.toHaveBeenCalled()
  })

  it('ai-write answers 404 for a project the caller does not own', async () => {
    mocks.user = { id: 'intruder', email: 'intruder@example.com' }
    const response = await aiWritePost(
      request({ projectId: 'project-1', requestId: 'req-12345678', topic: 'Konu başlığı', answers: {} }),
    )
    expect(response.status).toBe(404)
    expect(mocks.consumeCredits).not.toHaveBeenCalled()
  })
})
