import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeClient, type Tables } from '@/lib/__fixtures__/fake-supabase'
import { fallbackWebsite } from '@/lib/website-schema'

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  userId: 'owner-1',
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/mail/admin-guard', () => ({ isAdminEmail: () => false }))
vi.mock('@/lib/billing', () => ({ getMyCurrentPlan: vi.fn(), getPlanCodeForUser: async () => 'free' }))
vi.mock('@/lib/effective-limits', () => ({ getEffectiveSiteLimit: vi.fn(), getEffectiveProductLimit: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true, retryAfterMs: 0 }) }))
vi.mock('@/lib/billing-lifecycle', () => ({ isSubscriptionSuspended: vi.fn() }))
vi.mock('@/lib/store-sync', () => ({ syncStoreFromSchema: vi.fn() }))
vi.mock('@/lib/starter-blog-server', () => ({ scheduleStarterBlog: vi.fn() }))
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
      auth: { getUser: async () => ({ data: { user: { id: state.userId, email: 'o@test.dev' } } }) },
      ...createFakeClient(state.tables as Tables),
    }),
  }
})

import { createProject } from '@/lib/projects'
import { createEcommerceProject } from '@/lib/ecommerce'

function storeSchema() {
  return fallbackWebsite('e-ticaret sitesi oluştur, ayakkabı satan online mağaza', 'tr')
}

function lastProject() {
  const rows = state.tables.projects ?? []
  return rows[rows.length - 1] as { project_type: string; commerce_mode: string }
}

describe('commerce_mode on every project creation path', () => {
  beforeEach(() => {
    state.tables = { projects: [] }
  })

  it('home page generation (no projectType in the payload): a store schema is ecommerce/ecommerce', async () => {
    const schema = storeSchema()
    const hasStore = schema.sections.some((s) => s.type === 'products' || s.type === 'categories')
    await createProject({ name: schema.meta.name, schema })
    expect(lastProject().project_type).toBe(hasStore ? 'ecommerce' : 'corporate')
    expect(lastProject().commerce_mode).toBe(hasStore ? 'ecommerce' : 'none')
  })

  it('home page generation: a corporate schema is corporate/none', async () => {
    const schema = fallbackWebsite('diş kliniği için kurumsal site', 'tr')
    await createProject({ name: schema.meta.name, schema })
    expect(lastProject().project_type).toBe('corporate')
    expect(lastProject().commerce_mode).toBe('none')
  })

  it('dashboard "Yeni E-ticaret Mağazası" (createEcommerceProject) is ecommerce/ecommerce', async () => {
    await createEcommerceProject({ prompt: 'online ayakkabı mağazası', language: 'tr' })
    expect(lastProject().project_type).toBe('ecommerce')
    expect(lastProject().commerce_mode).toBe('ecommerce')
  })

  it('lib/ecommerce.ts starter project also holds in English', async () => {
    await createEcommerceProject({ prompt: '', language: 'en' })
    expect(lastProject().project_type).toBe('ecommerce')
    expect(lastProject().commerce_mode).toBe('ecommerce')
  })

  it('an explicit catalog setup keeps its own mode', async () => {
    const schema = storeSchema()
    await createProject({ name: schema.meta.name, schema, projectType: 'ecommerce', commerceMode: 'catalog' })
    expect(lastProject().commerce_mode).toBe('catalog')
  })
})
