import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ mode: 'none' as string }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
  }),
}))
vi.mock('@/lib/projects', () => ({ getPublishedSite: async () => ({ schema: {}, slug: 'demo' }) }))
vi.mock('@/lib/store', () => ({
  getStoreProducts: async () => {
    throw new Error('reached-catalog-data')
  },
}))
vi.mock('@/lib/commerce-mode-server', () => ({
  loadProjectCommerce: async () => ({ id: 'p1', published: true, mode: mocks.mode }),
  getCatalogContext: async () => ({}),
}))

import { loadPublicCatalog } from '@/lib/catalog-public-server'

afterEach(() => vi.unstubAllEnvs())

describe('/urunlerimiz data loader (drives the 404) ignores CATALOG_FEATURE_UI', () => {
  it.each(['', 'false', 'true'])('flag %j: non-catalog sites still resolve to null (404)', async (flag) => {
    vi.stubEnv('CATALOG_FEATURE_UI', flag)
    for (const mode of ['none', 'ecommerce']) {
      mocks.mode = mode
      expect(await loadPublicCatalog('demo')).toBeNull()
    }
  })

  it.each(['', 'false', 'true'])('flag %j: an already-enabled catalog site is never gated', async (flag) => {
    vi.stubEnv('CATALOG_FEATURE_UI', flag)
    mocks.mode = 'catalog'
    await expect(loadPublicCatalog('demo')).rejects.toThrow('reached-catalog-data')
  })
})
