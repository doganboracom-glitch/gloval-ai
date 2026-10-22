import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement } from 'react'
import { fakeDb } from '@/lib/__fixtures__/fake-db'
import EcommercePage from '@/app/ecommerce/[projectId]/page'
import { StoreNotEnabled } from '@/components/ecommerce/store-not-enabled'
import { EcommerceClient } from '@/components/ecommerce/ecommerce-client'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))
vi.mock('@/lib/supabase/server', async () => {
  const { fakeDb } = await import('@/lib/__fixtures__/fake-db')
  return { createClient: async () => fakeDb.client() }
})
vi.mock('@/lib/supabase/admin', async () => {
  const { fakeDb } = await import('@/lib/__fixtures__/fake-db')
  return { createAdminClient: () => fakeDb.client() }
})
vi.mock('@/lib/mail/admin-guard', () => ({ isAdminEmail: () => false }))
vi.mock('@/lib/billing', () => ({
  getMyCurrentPlan: async () => ({ code: 'pro' }),
  getPlanCodeForUser: async () => 'pro',
}))
vi.mock('@/lib/ecommerce', () => ({ listProducts: async () => [], listCategories: async () => [] }))
vi.mock('@/lib/store-collections-actions', () => ({
  listOwnerCollections: async () => ({ collections: [], available: true }),
}))
vi.mock('@/components/ecommerce/ecommerce-client', () => ({ EcommerceClient: () => null }))

const ID = 'project-1'

function seed(extra: Record<string, unknown>) {
  fakeDb.rows('projects').push({
    id: ID,
    owner_id: 'user-1',
    name: 'Site',
    slug: null,
    published: false,
    schema_data: {},
    ...extra,
  })
}

const render = () => EcommercePage({ params: Promise.resolve({ projectId: ID }) })

beforeEach(() => fakeDb.reset())

describe('/ecommerce/[projectId]', () => {
  it('shows the "store not enabled" screen for a corporate site', async () => {
    seed({ project_type: 'corporate', commerce_mode: 'none' })
    const el = await render()
    expect(isValidElement(el)).toBe(true)
    expect((el as { type: unknown }).type).toBe(StoreNotEnabled)
    expect((el as { props: { projectId: string } }).props.projectId).toBe(ID)
  })

  it('opens the management screen for a store', async () => {
    seed({ project_type: 'ecommerce', commerce_mode: 'ecommerce' })
    const el = await render()
    expect((el as { type: unknown }).type).toBe(EcommerceClient)
  })

  it('redirects a signed-out visitor to login instead of leaking either screen', async () => {
    seed({ project_type: 'corporate', commerce_mode: 'none' })
    fakeDb.user = null
    await expect(render()).rejects.toThrow(/NEXT_REDIRECT/)
  })
})
