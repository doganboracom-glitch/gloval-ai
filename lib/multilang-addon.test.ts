import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserCalls: 0,
  adminCalls: 0,
  entitlement: null as Record<string, unknown> | null,
  planRow: null as Record<string, unknown> | null,
  readError: null as unknown,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/ecommerce-access', () => ({
  requireUser: async () => {
    mocks.requireUserCalls += 1
    throw new Error('requireUser must not be reached while the flag is off')
  },
}))
vi.mock('@/lib/supabase/admin', () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {}
    chain.select = () => chain
    chain.eq = () => chain
    chain.maybeSingle = async () => ({
      data: table === 'billing_plans' ? mocks.planRow : mocks.entitlement,
      error: mocks.readError,
    })
    return chain
  }
  return {
    createAdminClient: () => {
      mocks.adminCalls += 1
      return { from: builder }
    },
  }
})

import { isMultilangFeatureUiEnabled } from '@/lib/multilang-feature-flag'
import { getMultilangPlanIfEnabled, hasAddon } from '@/lib/site-addons'
import { purchaseMultilangPackage } from '@/lib/project-entitlements'
import { MULTILANG_CODE } from '@/lib/billing-utils'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  mocks.requireUserCalls = 0
  mocks.adminCalls = 0
  mocks.entitlement = null
  mocks.planRow = { id: 'p1', code: MULTILANG_CODE, price_cents: 100000, active: false }
  mocks.readError = null
})
afterEach(() => vi.unstubAllEnvs())

describe('isMultilangFeatureUiEnabled', () => {
  it.each([undefined, '', 'false', 'TRUE', 'True', '1', 'yes', ' true'])('is OFF for %j', (value) => {
    expect(isMultilangFeatureUiEnabled({ MULTILANG_FEATURE_UI: value })).toBe(false)
  })
  it('is ON only for the exact string "true"', () => {
    expect(isMultilangFeatureUiEnabled({ MULTILANG_FEATURE_UI: 'true' })).toBe(true)
  })
})

describe('getMultilangPlanIfEnabled', () => {
  it('flag OFF: returns null without touching the database', async () => {
    expect(await getMultilangPlanIfEnabled({ MULTILANG_FEATURE_UI: undefined })).toBeNull()
    expect(mocks.adminCalls).toBe(0)
  })
  it('flag ON: returns the catalog row', async () => {
    const plan = await getMultilangPlanIfEnabled({ MULTILANG_FEATURE_UI: 'true' })
    expect(plan).toMatchObject({ code: MULTILANG_CODE, price_cents: 100000 })
  })
  it('flag ON but missing row or read error: returns null', async () => {
    mocks.planRow = null
    expect(await getMultilangPlanIfEnabled({ MULTILANG_FEATURE_UI: 'true' })).toBeNull()
  })
})

describe('purchaseMultilangPackage (forged call while the flag is off)', () => {
  it.each([undefined, 'false', '1'])('flag %j: refuses before auth and database access', async (value) => {
    vi.stubEnv('MULTILANG_FEATURE_UI', value ?? '')
    const result = await purchaseMultilangPackage(PROJECT_ID)
    expect(result).toMatchObject({ ok: false, error: 'feature_disabled' })
    expect(mocks.requireUserCalls).toBe(0)
    expect(mocks.adminCalls).toBe(0)
  })
})

describe('hasAddon', () => {
  it('is true only for an active entitlement', async () => {
    mocks.entitlement = { id: 'e1' }
    expect(await hasAddon(PROJECT_ID, MULTILANG_CODE)).toBe(true)
  })
  it('is false when no active row exists', async () => {
    expect(await hasAddon(PROJECT_ID, MULTILANG_CODE)).toBe(false)
  })
  it('fails closed on a read error', async () => {
    mocks.entitlement = { id: 'e1' }
    mocks.readError = new Error('boom')
    expect(await hasAddon(PROJECT_ID, MULTILANG_CODE)).toBe(false)
  })
  it('is false for empty ids without querying', async () => {
    expect(await hasAddon('', MULTILANG_CODE)).toBe(false)
    expect(await hasAddon(PROJECT_ID, '')).toBe(false)
    expect(mocks.adminCalls).toBe(0)
  })
})
