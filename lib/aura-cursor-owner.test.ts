import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/__fixtures__/fake-db'

const mocks = vi.hoisted(() => ({
  admin: { userId: 'admin-1', email: 'admin@example.com' } as { userId: string; email: string } | null,
  requireUserCalls: 0,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/supabase/server', async () => {
  const { fakeDb } = await import('@/lib/__fixtures__/fake-db')
  return { createClient: async () => fakeDb.client() }
})
vi.mock('@/lib/supabase/admin', async () => {
  const { fakeDb } = await import('@/lib/__fixtures__/fake-db')
  return { createAdminClient: () => fakeDb.client() }
})
vi.mock('@/lib/mail/admin-guard', () => ({
  isAdminEmail: () => false,
  requireAdmin: async () => {
    if (!mocks.admin) throw new Error('NOT_FOUND')
    return mocks.admin
  },
}))
vi.mock('@/lib/ecommerce-access', () => ({
  requireUser: async () => {
    mocks.requireUserCalls += 1
    throw new Error('requireUser must not be reached while the flag is off')
  },
}))
vi.mock('@/lib/mail/access-trigger', () => ({ triggerMailAccessSync: vi.fn() }))
vi.mock('@/lib/notify', () => ({
  notifyAccountReactivated: vi.fn(),
  notifyAccountSuspended: vi.fn(),
  recordNotification: vi.fn(),
  sendTransactionalEmail: vi.fn(),
}))
vi.mock('@/lib/support/ticket-reply-mail', () => ({ sendTicketReplyEmail: vi.fn() }))

import { AURA_CURSOR_CODE } from '@/lib/billing-utils'
import {
  DEFAULT_CURSOR_AURA,
  OWNER_CURSOR_AURA_LIMITS,
  clampToOwnerLimits,
  parseOwnerCursorAuraInput,
  type CursorAuraConfig,
} from '@/lib/cursor-aura'
import { isAuraCursorFeatureUiEnabled } from '@/lib/aura-cursor-feature-flag'
import { getMyCursorAura, setMyCursorAura } from '@/lib/aura-cursor-owner'
import { getAuraCursorPlanIfEnabled } from '@/lib/site-addons'
import { purchaseAuraCursor } from '@/lib/project-entitlements'
import { grantSiteAddon, revokeSiteAddon } from '@/lib/admin/actions'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const ADMIN_EFFECT: CursorAuraConfig = {
  enabled: true,
  colors: ['#22C55E', '#EF4444', '#06B6D4', '#A855F7', '#EC4899'],
  intensity: 0.95,
  size: 300,
}
const VALID_OWNER: CursorAuraConfig = { enabled: true, colors: ['#ef4444', '#22c55e'], intensity: 0.5, size: 140 }

function seedProject(opts: { ownerId?: string; effects?: unknown } = {}) {
  fakeDb.rows('projects').push({
    id: PROJECT_ID,
    owner_id: opts.ownerId ?? 'user-1',
    slug: 'kahve',
    published_version_id: 'v-1',
    schema_data: { sections: [], ...(opts.effects ? { effects: opts.effects } : {}) },
  })
  fakeDb.rows('project_versions').push({
    id: 'v-1',
    schema_data: { sections: [], ...(opts.effects ? { effects: opts.effects } : {}) },
  })
}

function seedRight(over: Record<string, unknown> = {}) {
  fakeDb.rows('project_entitlements').push({
    project_id: PROJECT_ID,
    user_id: 'user-1',
    code: AURA_CURSOR_CODE,
    status: 'active',
    provider: 'iyzico',
    amount_cents: 50000,
    ...over,
  })
}

beforeEach(() => {
  fakeDb.reset()
  mocks.admin = { userId: 'admin-1', email: 'admin@example.com' }
  mocks.requireUserCalls = 0
})
afterEach(() => vi.unstubAllEnvs())

describe('owner bounds', () => {
  it('are exactly: max 3 colours, intensity 0.2-0.7, size 80-200', () => {
    expect(OWNER_CURSOR_AURA_LIMITS).toEqual({
      colors: { min: 1, max: 3 },
      intensity: { min: 0.2, max: 0.7 },
      size: { min: 80, max: 200 },
    })
  })

  it.each([
    ['intensity at min', { intensity: 0.2 }],
    ['intensity at max', { intensity: 0.7 }],
    ['size at min', { size: 80 }],
    ['size at max', { size: 200 }],
    ['three colours', { colors: ['#111111', '#222222', '#333333'] }],
  ])('accepts the boundary value: %s', (_label, over) => {
    expect(parseOwnerCursorAuraInput({ ...VALID_OWNER, ...over })).not.toBeNull()
  })

  it.each([
    ['intensity 0.75', { intensity: 0.75 }],
    ['intensity 0.8', { intensity: 0.8 }],
    ['intensity 0.19', { intensity: 0.19 }],
    ['size 201', { size: 201 }],
    ['size 240', { size: 240 }],
    ['size 79', { size: 79 }],
  ])('rejects just outside the bounds: %s', (_label, over) => {
    expect(parseOwnerCursorAuraInput({ ...VALID_OWNER, ...over })).toBeNull()
  })

  it('accepts a config inside the owner bounds and upper-cases colours', () => {
    expect(parseOwnerCursorAuraInput(VALID_OWNER)).toEqual({ ...VALID_OWNER, colors: ['#EF4444', '#22C55E'] })
  })

  it.each([
    ['too many colours', { ...VALID_OWNER, colors: ['#111111', '#222222', '#333333', '#444444'] }],
    ['intensity above owner max', { ...VALID_OWNER, intensity: OWNER_CURSOR_AURA_LIMITS.intensity.max + 0.1 }],
    ['intensity below owner min', { ...VALID_OWNER, intensity: 0.1 }],
    ['size above owner max', { ...VALID_OWNER, size: 300 }],
    ['size below owner min', { ...VALID_OWNER, size: 70 }],
    ['not a hex colour', { ...VALID_OWNER, colors: ['red'] }],
    ['a string instead of an object', 'url(javascript:alert(1))'],
  ])('rejects %s', (_label, raw) => {
    expect(parseOwnerCursorAuraInput(raw)).toBeNull()
  })

  it('clamps a wider admin config into the owner bounds for display', () => {
    const clamped = clampToOwnerLimits(ADMIN_EFFECT)
    expect(clamped.colors).toHaveLength(OWNER_CURSOR_AURA_LIMITS.colors.max)
    expect(clamped.intensity).toBe(OWNER_CURSOR_AURA_LIMITS.intensity.max)
    expect(clamped.size).toBe(OWNER_CURSOR_AURA_LIMITS.size.max)
    expect(parseOwnerCursorAuraInput(clamped)).not.toBeNull()
  })
})

describe('selling flag', () => {
  it.each([undefined, '', 'false', 'TRUE', '1', ' true'])('is OFF for %j', (value) => {
    expect(isAuraCursorFeatureUiEnabled({ AURA_CURSOR_FEATURE_UI: value })).toBe(false)
  })

  it('is ON only for the exact string "true"', () => {
    expect(isAuraCursorFeatureUiEnabled({ AURA_CURSOR_FEATURE_UI: 'true' })).toBe(true)
  })

  it('catalog row is not read while the flag is off', async () => {
    expect(await getAuraCursorPlanIfEnabled({ AURA_CURSOR_FEATURE_UI: undefined })).toBeNull()
    expect(fakeDb.reads).toEqual([])
  })

  it('catalog row is returned while the flag is on', async () => {
    fakeDb.rows('billing_plans').push({ code: AURA_CURSOR_CODE, price_cents: 50000, active: false })
    expect(await getAuraCursorPlanIfEnabled({ AURA_CURSOR_FEATURE_UI: 'true' })).toMatchObject({
      code: AURA_CURSOR_CODE,
      price_cents: 50000,
    })
  })

  it.each([undefined, 'false', '1'])('forged purchase with flag %j is refused before auth', async (value) => {
    vi.stubEnv('AURA_CURSOR_FEATURE_UI', value ?? '')
    const result = await purchaseAuraCursor(PROJECT_ID, undefined)
    expect(result).toEqual({ ok: false, error: 'feature_disabled' })
    expect(mocks.requireUserCalls).toBe(0)
  })
})

describe('owner action authorization', () => {
  it('refuses a signed-out caller', async () => {
    seedProject()
    seedRight()
    fakeDb.user = null
    expect(await setMyCursorAura(PROJECT_ID, VALID_OWNER)).toEqual({ ok: false, error: 'unauthenticated' })
  })

  it('refuses a malformed project id', async () => {
    expect(await setMyCursorAura('not-a-uuid', VALID_OWNER)).toEqual({ ok: false, error: 'invalid_site' })
  })

  it('refuses a site the caller does not own, even when a right row exists', async () => {
    seedProject({ ownerId: 'someone-else' })
    seedRight({ user_id: 'someone-else' })
    expect(await setMyCursorAura(PROJECT_ID, VALID_OWNER)).toEqual({ ok: false, error: 'invalid_site' })
  })

  it('refuses an owner without the right', async () => {
    seedProject()
    expect(await setMyCursorAura(PROJECT_ID, VALID_OWNER)).toEqual({ ok: false, error: 'not_entitled' })
  })

  it('refuses a right that was revoked or is inactive', async () => {
    seedProject()
    seedRight({ status: 'revoked' })
    expect(await setMyCursorAura(PROJECT_ID, VALID_OWNER)).toEqual({ ok: false, error: 'not_entitled' })
  })

  it('refuses a right held for a different site', async () => {
    seedProject()
    seedRight({ project_id: OTHER_PROJECT_ID })
    expect(await setMyCursorAura(PROJECT_ID, VALID_OWNER)).toEqual({ ok: false, error: 'not_entitled' })
  })

  it('refuses out-of-bounds input from an entitled owner and writes nothing', async () => {
    seedProject({ effects: { cursorAura: ADMIN_EFFECT } })
    seedRight()
    expect(await setMyCursorAura(PROJECT_ID, { ...VALID_OWNER, size: 320 })).toEqual({
      ok: false,
      error: 'invalid_aura',
    })
    expect(fakeDb.writes.filter((w) => w.table === 'projects')).toEqual([])
  })

  it('saves valid input to the draft and the live published snapshot, touching only effects', async () => {
    seedProject()
    seedRight()
    expect(await setMyCursorAura(PROJECT_ID, VALID_OWNER)).toEqual({ ok: true })
    const expected = { cursorAura: { ...VALID_OWNER, colors: ['#EF4444', '#22C55E'], source: 'owner' } }
    expect(fakeDb.rows('projects')[0].schema_data).toEqual({ sections: [], effects: expected })
    expect(fakeDb.rows('project_versions')[0].schema_data).toEqual({ sections: [], effects: expected })
  })

  it('lets an entitled owner switch the aura off without removing the stored effect', async () => {
    seedProject({ effects: { cursorAura: ADMIN_EFFECT } })
    seedRight()
    await setMyCursorAura(PROJECT_ID, { ...VALID_OWNER, enabled: false })
    const stored = fakeDb.rows('projects')[0].schema_data.effects.cursorAura
    expect(stored.enabled).toBe(false)
  })

  it('reads the current aura inside the owner bounds', async () => {
    seedProject({ effects: { cursorAura: ADMIN_EFFECT } })
    seedRight()
    const result = await getMyCursorAura(PROJECT_ID)
    expect(result.ok).toBe(true)
    if (result.ok) expect(parseOwnerCursorAuraInput(result.config)).not.toBeNull()
  })

  it('reads the default when nothing is stored', async () => {
    seedProject()
    seedRight()
    const result = await getMyCursorAura(PROJECT_ID)
    expect(result).toEqual({ ok: true, config: clampToOwnerLimits(DEFAULT_CURSOR_AURA) })
  })
})

describe('admin grant and revoke', () => {
  it('a non-admin never reaches the database', async () => {
    mocks.admin = null
    seedProject()
    await expect(grantSiteAddon(PROJECT_ID, AURA_CURSOR_CODE)).rejects.toThrow('NOT_FOUND')
    expect(fakeDb.rows('project_entitlements')).toEqual([])
  })

  it('refuses an add-on code that is not grantable', async () => {
    seedProject()
    expect(await grantSiteAddon(PROJECT_ID, 'multilang')).toEqual({ ok: false, error: 'invalid_addon' })
    expect(await grantSiteAddon(PROJECT_ID, 'branding_removal')).toEqual({ ok: false, error: 'invalid_addon' })
  })

  it('grants a free admin_grant right to the site owner with no charge recorded', async () => {
    seedProject()
    expect(await grantSiteAddon(PROJECT_ID, AURA_CURSOR_CODE)).toEqual({ ok: true })
    expect(fakeDb.rows('project_entitlements')).toHaveLength(1)
    expect(fakeDb.rows('project_entitlements')[0]).toMatchObject({
      project_id: PROJECT_ID,
      user_id: 'user-1',
      code: AURA_CURSOR_CODE,
      status: 'active',
      provider: 'admin_grant',
      amount_cents: 0,
    })
    expect(fakeDb.rows('billing_transactions') ?? []).toEqual([])
  })

  it('never overwrites a right that is already active', async () => {
    seedProject()
    seedRight()
    expect(await grantSiteAddon(PROJECT_ID, AURA_CURSOR_CODE)).toEqual({ ok: false, error: 'already_owned' })
    expect(fakeDb.rows('project_entitlements')[0]).toMatchObject({ provider: 'iyzico', amount_cents: 50000 })
  })

  it('revokes an admin_grant right', async () => {
    seedProject()
    seedRight({ provider: 'admin_grant', amount_cents: 0 })
    expect(await revokeSiteAddon(PROJECT_ID, AURA_CURSOR_CODE)).toEqual({ ok: true })
    expect(fakeDb.rows('project_entitlements')[0].status).toBe('revoked')
  })

  it('refuses to revoke a right the owner paid for', async () => {
    seedProject()
    seedRight()
    expect(await revokeSiteAddon(PROJECT_ID, AURA_CURSOR_CODE)).toEqual({ ok: false, error: 'paid_right' })
    expect(fakeDb.rows('project_entitlements')[0].status).toBe('active')
  })

  it('reports not_granted when there is nothing to revoke', async () => {
    seedProject()
    expect(await revokeSiteAddon(PROJECT_ID, AURA_CURSOR_CODE)).toEqual({ ok: false, error: 'not_granted' })
  })
})
