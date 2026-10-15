import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/__fixtures__/fake-db'
import { PAGE_LIMIT_ERROR } from '@/lib/page-limits'
import { saveProjectSchema } from '@/lib/projects'
import { fallbackWebsite, type WebsiteSchema } from '@/lib/website-schema'

const plan = vi.hoisted(() => ({ code: 'free' }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
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
  getMyCurrentPlan: async () => ({ code: plan.code }),
  getPlanCodeForUser: async () => plan.code,
}))
vi.mock('@/lib/billing-lifecycle', () => ({ isSubscriptionSuspended: async () => false }))
vi.mock('@/lib/effective-limits', () => ({
  getEffectiveSiteLimit: async () => 5,
  getEffectiveProductLimit: async () => null,
}))
vi.mock('@/lib/store-sync', () => ({ syncStoreFromSchema: vi.fn(async () => {}) }))

const ID = 'project-1'

function siteWithPages(count: number): WebsiteSchema {
  return {
    ...fallbackWebsite('kahve dükkanı', 'tr'),
    pages: Array.from({ length: count }, (_, i) => ({
      slug: i === 0 ? 'home' : `sayfa-${i}`,
      title: i === 0 ? 'Ana Sayfa' : `Sayfa ${i}`,
      isHome: i === 0,
    })) as WebsiteSchema['pages'],
  }
}

function seed(count: number) {
  fakeDb.rows('projects').push({
    id: ID,
    owner_id: 'user-1',
    name: 'Kahve',
    slug: null,
    published: false,
    published_version_id: null,
    schema_data: siteWithPages(count),
  })
}

const savedPages = () => (fakeDb.rows('projects')[0].schema_data as WebsiteSchema).pages?.length

beforeEach(() => {
  fakeDb.reset()
  plan.code = 'free'
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('server-side page limit on save', () => {
  it('refuses growth past the plan limit and persists nothing', async () => {
    seed(5)
    await expect(saveProjectSchema({ id: ID, schema: siteWithPages(6) })).rejects.toThrow(PAGE_LIMIT_ERROR)
    expect(savedPages()).toBe(5)
  })

  it('accepts growth up to the limit of a higher plan', async () => {
    plan.code = 'starter'
    seed(5)
    await saveProjectSchema({ id: ID, schema: siteWithPages(8) })
    expect(savedPages()).toBe(8)
    await expect(saveProjectSchema({ id: ID, schema: siteWithPages(9) })).rejects.toThrow(PAGE_LIMIT_ERROR)
  })

  it('lets a downgraded site that is over its limit keep editing without growing', async () => {
    seed(12)
    await saveProjectSchema({ id: ID, schema: siteWithPages(12) })
    expect(savedPages()).toBe(12)
    await saveProjectSchema({ id: ID, schema: siteWithPages(10) })
    expect(savedPages()).toBe(10)
    await expect(saveProjectSchema({ id: ID, schema: siteWithPages(11) })).rejects.toThrow(PAGE_LIMIT_ERROR)
  })

  it('records a redirect when a page slug changes on save', async () => {
    seed(3)
    const renamed = siteWithPages(3)
    renamed.pages![1].slug = 'yeni-ad'
    await saveProjectSchema({ id: ID, schema: renamed })
    const saved = fakeDb.rows('projects')[0].schema_data as WebsiteSchema
    expect(saved.pageRedirects).toEqual([{ from: '/sayfa-1', to: '/yeni-ad' }])
  })
})
