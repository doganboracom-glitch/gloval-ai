import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  getUserError: null as Error | null,
  consumeCredits: vi.fn(async () => ({ ok: true, balance: 1 })),
  getCreditBalance: vi.fn(async () => 100),
  adminFrom: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: mocks.user },
        error: mocks.getUserError,
      }),
    },
    from: mocks.adminFrom,
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.adminFrom }) }))
vi.mock('@/lib/ai-credits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai-credits')>()),
  consumeCredits: mocks.consumeCredits,
  getCreditBalance: mocks.getCreditBalance,
}))

import { rejectAnonymous } from '@/lib/api-auth'

/** Every editor endpoint that must turn anonymous callers away with 401. */
const GUARDED_ROUTES = [
  'about-alt',
  'about-detail',
  'blog/ai-write',
  'blog/cover',
  'blog/operation',
  'blog/personalize',
  'ecommerce/ai-image/accept',
  'ecommerce/ai-image',
  'ecommerce/ai-text',
  'ecommerce/product-images',
  'edit',
  'gallery-video-cover',
  'hero-image',
  'logo-image',
  'product-detail',
  'section-image',
  'service-detail',
] as const

const ROUTE_MODULES = import.meta.glob('../app/api/**/route.ts') as Record<string, () => Promise<unknown>>

function postRequest(path: string) {
  return new Request(`http://localhost/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schema: {}, instruction: 'x', request: 'x' }),
  })
}

beforeEach(() => {
  mocks.user = null
  mocks.getUserError = null
  mocks.consumeCredits.mockClear()
  mocks.getCreditBalance.mockClear()
  mocks.adminFrom.mockClear()
})

describe('rejectAnonymous', () => {
  it('returns 401 with no-store for an anonymous caller', async () => {
    const res = await rejectAnonymous()
    expect(res?.status).toBe(401)
    expect(res?.headers.get('Cache-Control')).toBe('no-store')
    expect(await res?.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 when the session lookup errors', async () => {
    mocks.user = { id: 'u1' }
    mocks.getUserError = new Error('jwt expired')
    expect((await rejectAnonymous())?.status).toBe(401)
  })

  it('lets a signed-in caller through', async () => {
    mocks.user = { id: 'u1' }
    expect(await rejectAnonymous()).toBeNull()
  })
})

describe('anonymous POST to editor endpoints', () => {
  it.each(GUARDED_ROUTES)('/api/%s answers 401 before any credit logic', async (path) => {
    const load = ROUTE_MODULES[`../app/api/${path}/route.ts`]
    expect(load, `route module for ${path}`).toBeDefined()
    const mod = (await load()) as { POST: (req: Request) => Promise<Response> }
    const res = await mod.POST(postRequest(path))
    expect(res.status).toBe(401)
    expect(mocks.consumeCredits).not.toHaveBeenCalled()
    expect(mocks.getCreditBalance).not.toHaveBeenCalled()
    expect(mocks.adminFrom).not.toHaveBeenCalled()
  })
})
