import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>
type Err = { code: string; message: string } | null

const db = vi.hoisted(() => ({
  user: null as { id: string } | null,
  tables: {} as Record<string, Row[]>,
  failOn: null as string | null,
  deleteUserError: null as string | null,
  calls: [] as string[],
}))

function seed() {
  db.user = { id: 'user-1' }
  db.failOn = null
  db.deleteUserError = null
  db.calls = []
  db.tables = {
    projects: [
      { id: 'p1', owner_id: 'user-1', published: true, slug: 'kahve' },
      { id: 'p2', owner_id: 'user-1', published: false, slug: 'taslak' },
      { id: 'p9', owner_id: 'user-2', published: true, slug: 'baska' },
    ],
    ecommerce_orders: [
      { id: 'o1', owner_id: 'user-1', project_id: 'p1', total: 250 },
      { id: 'o2', owner_id: 'user-2', project_id: 'p9', total: 90 },
    ],
    ecommerce_order_items: [
      { id: 'i1', project_id: 'p1', order_id: 'o1' },
      { id: 'i2', project_id: 'p9', order_id: 'o2' },
    ],
    billing_subscriptions: [{ id: 's1', user_id: 'user-1' }],
    billing_transactions: [{ id: 't1', user_id: 'user-1' }],
  }
}

function adminClient() {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      let patch: Row | null = null
      const rows = () => (db.tables[table] ??= [])
      const run = (): { data: Row[] | null; error: Err } => {
        db.calls.push(patch ? `update:${table}` : `select:${table}`)
        if (db.failOn === table) return { data: null, error: { code: 'XX000', message: 'boom' } }
        const hit = rows().filter((r) => filters.every((f) => f(r)))
        if (patch) hit.forEach((r) => Object.assign(r, patch))
        return { data: hit, error: null }
      }
      const builder: any = {
        select: () => builder,
        update: (p: Row) => {
          patch = p
          return builder
        },
        eq: (col: string, val: unknown) => {
          filters.push((r) => r[col] === val)
          return builder
        },
        in: (col: string, vals: unknown[]) => {
          filters.push((r) => vals.includes(r[col]))
          return builder
        },
        then: (resolve: (v: unknown) => void) => resolve(run()),
      }
      return builder
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          db.calls.push('deleteUser')
          if (db.deleteUserError) return { error: { message: db.deleteUserError } }
          // auth.users -> projects cascades; orders/items/billing were detached beforehand.
          const goneProjects = db.tables.projects.filter((p) => p.owner_id === id).map((p) => p.id)
          db.tables.projects = db.tables.projects.filter((p) => p.owner_id !== id)
          db.tables.ecommerce_orders = db.tables.ecommerce_orders.filter(
            (o) => o.owner_id !== id && !goneProjects.includes(o.project_id),
          )
          return { error: null }
        },
      },
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: db.user } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient() }))

import { deleteOwnAccount } from '@/lib/account'

beforeEach(seed)

describe('deleteOwnAccount', () => {
  it('refuses anonymous callers before touching any data', async () => {
    db.user = null
    expect(await deleteOwnAccount()).toEqual({ ok: false, error: 'not_authenticated' })
    expect(db.calls).toEqual([])
  })

  it('anonymizes orders by owner_id (owner and project cleared) before deleting', async () => {
    expect(await deleteOwnAccount()).toEqual({ ok: true })
    const order = db.tables.ecommerce_orders.find((o) => o.id === 'o1')
    expect(order).toMatchObject({ owner_id: null, project_id: null, total: 250 })
    expect(db.calls.indexOf('update:ecommerce_orders')).toBeLessThan(db.calls.indexOf('deleteUser'))
  })

  it('keeps financial records: orders, items, subscriptions and transactions survive', async () => {
    await deleteOwnAccount()
    expect(db.tables.ecommerce_orders.map((o) => o.id)).toContain('o1')
    expect(db.tables.ecommerce_order_items.find((i) => i.id === 'i1')?.project_id).toBeNull()
    expect(db.tables.billing_subscriptions[0].user_id).toBeNull()
    expect(db.tables.billing_transactions[0].user_id).toBeNull()
  })

  it('leaves other owners records untouched', async () => {
    await deleteOwnAccount()
    expect(db.tables.ecommerce_orders.find((o) => o.id === 'o2')).toMatchObject({ owner_id: 'user-2', project_id: 'p9' })
    expect(db.tables.ecommerce_order_items.find((i) => i.id === 'i2')?.project_id).toBe('p9')
    expect(db.tables.projects.some((p) => p.id === 'p9')).toBe(true)
  })

  it('takes the owner published sites down with the account', async () => {
    expect(db.tables.projects.filter((p) => p.owner_id === 'user-1' && p.published)).toHaveLength(1)
    await deleteOwnAccount()
    expect(db.tables.projects.filter((p) => p.owner_id === 'user-1')).toHaveLength(0)
  })

  it.each(['projects', 'ecommerce_orders', 'ecommerce_order_items', 'billing_subscriptions', 'billing_transactions'])(
    'stops before deleting the user when the %s query fails',
    async (table) => {
      db.failOn = table
      expect(await deleteOwnAccount()).toEqual({ ok: false, error: 'delete_failed' })
      expect(db.calls).not.toContain('deleteUser')
      expect(db.tables.projects.filter((p) => p.owner_id === 'user-1')).toHaveLength(2)
      expect(db.tables.ecommerce_orders.find((o) => o.id === 'o1')).toBeDefined()
    },
  )

  it('reports delete_failed when the auth deletion itself fails', async () => {
    db.deleteUserError = 'auth down'
    expect(await deleteOwnAccount()).toEqual({ ok: false, error: 'delete_failed' })
  })
})
