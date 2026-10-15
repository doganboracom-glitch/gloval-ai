import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  plan: null as string | null,
  planCalls: 0,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mocks.row, error: null }) }),
      }),
    }),
  }),
}))
vi.mock('@/lib/billing', () => ({
  getPlanCodeForUser: async () => {
    mocks.planCalls += 1
    return mocks.plan
  },
}))

import { CATALOG_NOT_AVAILABLE, COMMERCE_NOT_AVAILABLE } from '@/lib/commerce-mode'
import {
  assertCatalogPlan,
  assertEcommerceProject,
  assertEcommerceSlug,
  getPublishedSiteCommerceMode,
  isEcommerceProjectId,
  isEcommerceSlug,
  loadProjectCommerce,
} from '@/lib/commerce-mode-server'

function project(mode: string | null, type = 'corporate', published = true) {
  return {
    id: 'p1',
    owner_id: 'u1',
    slug: 'demo',
    published,
    project_type: type,
    commerce_mode: mode,
  }
}

const PLANS = ['free', 'starter', 'pro', 'ecommerce'] as const

beforeEach(() => {
  mocks.row = null
  mocks.plan = null
  mocks.planCalls = 0
})

describe('transaction guards (cart, order, checkout, customer endpoints)', () => {
  it.each(PLANS)('rejects a catalog site for the %s plan', async (plan) => {
    mocks.row = project('catalog')
    mocks.plan = plan
    await expect(assertEcommerceSlug('demo')).rejects.toThrow(COMMERCE_NOT_AVAILABLE)
    await expect(assertEcommerceProject('p1')).rejects.toThrow(COMMERCE_NOT_AVAILABLE)
    expect(await isEcommerceSlug('demo')).toBe(false)
    expect(await isEcommerceProjectId('p1')).toBe(false)
  })

  it('rejects a site without commerce and an unknown site', async () => {
    mocks.row = project('none')
    await expect(assertEcommerceSlug('demo')).rejects.toThrow(COMMERCE_NOT_AVAILABLE)
    mocks.row = null
    await expect(assertEcommerceSlug('missing')).rejects.toThrow(COMMERCE_NOT_AVAILABLE)
  })

  it('accepts a real e-commerce store and does not look up the plan for it', async () => {
    mocks.row = project('ecommerce', 'ecommerce')
    const commerce = await assertEcommerceSlug('demo')
    expect(commerce.mode).toBe('ecommerce')
    expect(await isEcommerceSlug('demo')).toBe(true)
    expect(mocks.planCalls).toBe(0)
  })

  it('keeps legacy projects working: no commerce_mode column value, project_type decides', async () => {
    mocks.row = project(null, 'ecommerce')
    expect((await assertEcommerceProject('p1')).mode).toBe('ecommerce')
    mocks.row = project(null, 'corporate')
    await expect(assertEcommerceProject('p1')).rejects.toThrow(COMMERCE_NOT_AVAILABLE)
  })
})

describe('catalog plan gate on product writes', () => {
  it.each([
    ['free', true],
    ['starter', true],
    ['pro', false],
    ['ecommerce', false],
  ] as const)('%s plan: blocked=%s', async (plan, blocked) => {
    mocks.row = project('catalog')
    mocks.plan = plan
    const commerce = await loadProjectCommerce({ id: 'p1' })
    expect(commerce).not.toBeNull()
    if (blocked) expect(() => assertCatalogPlan(commerce!)).toThrow(CATALOG_NOT_AVAILABLE)
    else expect(() => assertCatalogPlan(commerce!)).not.toThrow()
  })

  it('blocks a catalog owner with no plan at all', async () => {
    mocks.row = project('catalog')
    mocks.plan = null
    const commerce = await loadProjectCommerce({ id: 'p1' })
    expect(() => assertCatalogPlan(commerce!)).toThrow(CATALOG_NOT_AVAILABLE)
  })

  it('never blocks store or plain sites', () => {
    expect(() => assertCatalogPlan({ storedMode: 'ecommerce', ownerPlanCode: 'free' })).not.toThrow()
    expect(() => assertCatalogPlan({ storedMode: 'none', ownerPlanCode: null })).not.toThrow()
  })
})

describe('downgrade and upgrade', () => {
  it('reads as none after a downgrade while keeping the stored catalog mode', async () => {
    mocks.row = project('catalog')
    mocks.plan = 'starter'
    const commerce = await loadProjectCommerce({ slug: 'demo' })
    expect(commerce?.mode).toBe('none')
    expect(commerce?.storedMode).toBe('catalog')
    expect(await getPublishedSiteCommerceMode('demo')).toBe('none')
  })

  it('comes back as catalog when the owner returns to PRO (same stored row)', async () => {
    mocks.row = project('catalog')
    mocks.plan = 'free'
    expect(await getPublishedSiteCommerceMode('demo')).toBe('none')
    mocks.plan = 'pro'
    expect(await getPublishedSiteCommerceMode('demo')).toBe('catalog')
  })

  it('treats unpublished sites as none (store routes 404, out of sitemap)', async () => {
    mocks.row = project('catalog', 'corporate', false)
    mocks.plan = 'pro'
    expect(await getPublishedSiteCommerceMode('demo')).toBe('none')
  })
})
