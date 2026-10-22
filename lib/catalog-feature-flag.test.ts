import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserCalls: 0,
  adminCalls: 0,
  project: { id: '', owner_id: 'u1', project_type: 'corporate', commerce_mode: 'none' } as Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
}))

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/billing', () => ({ getPlanCodeForUser: async () => 'pro' }))
vi.mock('@/lib/commerce-mode-server', () => ({ loadProjectCommerce: async () => null }))
vi.mock('@/lib/ecommerce-access', () => ({
  requireUser: async () => {
    mocks.requireUserCalls += 1
    return { supabase: { auth: { getUser: async () => ({ data: { user: { email: 'o@x.com' } } }) } }, userId: 'u1' }
  },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    mocks.adminCalls += 1
    return {
      from: (table: string) => ({
        select: () => ({
          eq: () =>
            table === 'projects'
              ? { maybeSingle: async () => ({ data: mocks.project, error: null }) }
              : Promise.resolve({ count: 0, error: null }),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: async () => {
            mocks.updates.push(values)
            return { error: null }
          },
        }),
        insert: async (row: Record<string, unknown>) => {
          mocks.audits.push(row)
          return { error: null }
        },
      }),
    }
  },
}))

import { setCatalogEnabled } from '@/lib/catalog-feature-actions'
import { isCatalogFeatureUiEnabled, resolveCatalogFeatureTab } from '@/lib/catalog-feature-flag'

beforeEach(() => {
  mocks.requireUserCalls = 0
  mocks.adminCalls = 0
  mocks.updates = []
  mocks.audits = []
  mocks.project = { id: PROJECT_ID, owner_id: 'u1', project_type: 'corporate', commerce_mode: 'none' }
})
afterEach(() => vi.unstubAllEnvs())

describe('isCatalogFeatureUiEnabled', () => {
  it.each([undefined, '', 'false', 'TRUE', 'True', '1', 'yes', ' true'])('is OFF for %j', (value) => {
    expect(isCatalogFeatureUiEnabled({ CATALOG_FEATURE_UI: value })).toBe(false)
  })
  it('is ON only for the exact string "true"', () => {
    expect(isCatalogFeatureUiEnabled({ CATALOG_FEATURE_UI: 'true' })).toBe(true)
  })
  it('reads process.env by default (unset = off)', () => {
    vi.stubEnv('CATALOG_FEATURE_UI', '')
    expect(isCatalogFeatureUiEnabled()).toBe(false)
    vi.stubEnv('CATALOG_FEATURE_UI', 'true')
    expect(isCatalogFeatureUiEnabled()).toBe(true)
  })
})

describe('editor "Ürünler" tab entry point', () => {
  const base = {
    isOwner: true,
    projectId: PROJECT_ID,
    projectType: 'corporate',
    commerceMode: 'none',
    planCode: 'pro',
  }

  it.each(['none', 'catalog'])('flag OFF hides the tab even for a %s site (existing catalogs included)', (mode) => {
    expect(resolveCatalogFeatureTab({ ...base, flagEnabled: false, commerceMode: mode })).toBeNull()
  })

  it('flag ON shows the tab to the owner of a corporate site', () => {
    expect(resolveCatalogFeatureTab({ ...base, flagEnabled: true })).toEqual({
      projectId: PROJECT_ID,
      enabled: false,
      planAllowed: true,
    })
    expect(resolveCatalogFeatureTab({ ...base, flagEnabled: true, commerceMode: 'catalog' })?.enabled).toBe(true)
  })

  it('flag ON still hides it for stores and non-owners', () => {
    expect(resolveCatalogFeatureTab({ ...base, flagEnabled: true, commerceMode: 'ecommerce' })).toBeNull()
    expect(resolveCatalogFeatureTab({ ...base, flagEnabled: true, projectType: 'ecommerce' })).toBeNull()
    expect(resolveCatalogFeatureTab({ ...base, flagEnabled: true, isOwner: false })).toBeNull()
  })
})

describe('setCatalogEnabled server action', () => {
  it.each([undefined, 'false', '1'])('flag %j: returns feature_disabled and touches nothing', async (value) => {
    if (value !== undefined) vi.stubEnv('CATALOG_FEATURE_UI', value)
    else vi.stubEnv('CATALOG_FEATURE_UI', '')
    for (const enable of [true, false]) {
      const result = await setCatalogEnabled(PROJECT_ID, enable)
      expect(result).toMatchObject({ ok: false, error: 'feature_disabled' })
    }
    expect(mocks.requireUserCalls).toBe(0)
    expect(mocks.adminCalls).toBe(0)
    expect(mocks.updates).toEqual([])
    expect(mocks.audits).toEqual([])
  })

  it('flag ON: turns the catalog on, writing commerce_mode only, with an audit row', async () => {
    vi.stubEnv('CATALOG_FEATURE_UI', 'true')
    const result = await setCatalogEnabled(PROJECT_ID, true)
    expect(result).toEqual({ ok: true, enabled: true })
    expect(mocks.updates).toEqual([{ commerce_mode: 'catalog' }])
    expect(mocks.audits).toHaveLength(1)
    expect(mocks.audits[0]).toMatchObject({ from_type: 'corporate', to_type: 'corporate', to_mode: 'catalog' })
  })

  it('flag ON: turns an enabled catalog off', async () => {
    vi.stubEnv('CATALOG_FEATURE_UI', 'true')
    mocks.project = { ...mocks.project, commerce_mode: 'catalog' }
    expect(await setCatalogEnabled(PROJECT_ID, false)).toEqual({ ok: true, enabled: false })
    expect(mocks.updates).toEqual([{ commerce_mode: 'none' }])
  })
})
