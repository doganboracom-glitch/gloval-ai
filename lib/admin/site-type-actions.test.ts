import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Simulated tests: the Supabase client and admin guard are mocked. They verify
 * the setSiteType contract (guard first, reason required, blockers, the exact
 * columns written, the audit row, rollback when the audit row fails) - NOT the
 * real database, RLS or grants.
 */

const ADMIN_ID = '11111111-1111-4111-8111-111111111111'
const SITE_ID = '495b08b1-49e9-4f88-beb1-722c606c808b'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  adminOk: true,
  project: null as Row | null,
  products: 0,
  orders: 0,
  auditError: null as null | { message: string },
  updates: [] as Array<{ table: string; patch: Row }>,
  inserts: [] as Array<{ table: string; row: Row }>,
  clientCreated: 0,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: vi.fn() }))
vi.mock('@/lib/mail/access-trigger', () => ({ triggerMailAccessSync: vi.fn() }))
vi.mock('@/lib/notify', () => ({
  SUPPORT_EMAIL: 'x@y.z',
  notifyAccountReactivated: vi.fn(),
  notifyAccountSuspended: vi.fn(),
  recordNotification: vi.fn(),
  sendTransactionalEmail: vi.fn(),
}))
vi.mock('@/lib/mail/admin-guard', () => ({
  requireAdmin: vi.fn(async () => {
    if (!state.adminOk) throw new Error('NEXT_NOT_FOUND')
    return { email: 'admin@gloval.ai', userId: ADMIN_ID }
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    state.clientCreated++
    return {
      from: (table: string) => {
        const query: Record<string, unknown> = {}
        query.select = () => query
        query.eq = () => query
        query.maybeSingle = async () => ({ data: table === 'projects' ? state.project : null })
        query.then = (resolve: (value: unknown) => unknown) =>
          resolve({ count: table === 'ecommerce_products' ? state.products : state.orders })
        query.update = (patch: Row) => {
          state.updates.push({ table, patch })
          return { eq: async () => ({ error: null }) }
        }
        query.insert = async (row: Row) => {
          state.inserts.push({ table, row })
          return { error: table === 'site_type_changes' ? state.auditError : null }
        }
        return query
      },
    }
  },
}))

import { setSiteType } from './actions'

beforeEach(() => {
  state.adminOk = true
  state.project = {
    id: SITE_ID,
    name: 'DBAJANS',
    published: true,
    project_type: 'ecommerce',
    commerce_mode: 'none',
    schema_data: { sections: [] },
  }
  state.products = 0
  state.orders = 0
  state.auditError = null
  state.updates = []
  state.inserts = []
  state.clientCreated = 0
})

describe('setSiteType', () => {
  it('rejects a non-admin before any database client is created', async () => {
    state.adminOk = false
    await expect(setSiteType(SITE_ID, 'corporate', 'reason')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(state.clientCreated).toBe(0)
  })

  it('requires a reason and writes nothing without one', async () => {
    expect(await setSiteType(SITE_ID, 'corporate', '  ')).toEqual({ ok: false, error: 'note_required' })
    expect(state.updates).toEqual([])
    expect(state.inserts).toEqual([])
  })

  it('writes both type columns together and records who changed what and why', async () => {
    const res = await setSiteType(SITE_ID, 'corporate', 'Mistyped as store')
    expect(res).toEqual({ ok: true })
    expect(state.updates).toEqual([
      { table: 'projects', patch: { project_type: 'corporate', commerce_mode: 'none' } },
    ])
    expect(state.inserts).toEqual([
      {
        table: 'site_type_changes',
        row: {
          project_id: SITE_ID,
          actor_id: ADMIN_ID,
          actor_email: 'admin@gloval.ai',
          from_type: 'ecommerce',
          from_mode: 'none',
          to_type: 'corporate',
          to_mode: 'none',
          note: 'Mistyped as store',
        },
      },
    ])
  })

  it('undoes the switch and reports audit_failed when the audit row cannot be written', async () => {
    state.auditError = { message: 'permission denied' }
    const res = await setSiteType(SITE_ID, 'corporate', 'Mistyped as store')
    expect(res).toEqual({ ok: false, error: 'audit_failed' })
    expect(state.updates.map((u) => u.patch)).toEqual([
      { project_type: 'corporate', commerce_mode: 'none' },
      { project_type: 'ecommerce', commerce_mode: 'none' },
    ])
  })

  it('refuses to leave e-commerce while the catalog holds products, and writes nothing', async () => {
    state.products = 2
    expect(await setSiteType(SITE_ID, 'corporate', 'try')).toEqual({ ok: false, error: 'has_store_data' })
    expect(state.updates).toEqual([])
    expect(state.inserts).toEqual([])
  })

  it('refuses a switch to the type the site already has', async () => {
    state.project = { ...(state.project as Row), project_type: 'corporate', commerce_mode: 'none' }
    expect(await setSiteType(SITE_ID, 'corporate', 'noop')).toEqual({ ok: false, error: 'no_change' })
    expect(state.updates).toEqual([])
  })

  it('maps catalog to the ecommerce project_type with commerce_mode catalog', async () => {
    state.project = { ...(state.project as Row), project_type: 'corporate', commerce_mode: 'none' }
    expect(await setSiteType(SITE_ID, 'catalog', 'catalog only')).toEqual({ ok: true })
    expect(state.updates[0].patch).toEqual({ project_type: 'ecommerce', commerce_mode: 'catalog' })
  })
})
