import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>
type Err = { code: string; message: string } | null

const db = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  tables: {} as Record<string, Row[]>,
  /** `table.column` pairs that still carry NOT NULL (i.e. scripts/075 not applied). */
  notNull: new Set<string>(),
  failOn: null as string | null,
  deleteUserError: null as string | null,
  storageFiles: {} as Record<string, string[]>,
  storageFailOn: null as string | null,
  removedHosts: [] as string[],
  calls: [] as string[],
}))

const EMAIL = 'music.operatoru@hotmail.com'

function seedFreeAccount() {
  db.user = { id: 'user-1', email: EMAIL }
  db.notNull = new Set()
  db.failOn = null
  db.deleteUserError = null
  db.storageFailOn = null
  db.removedHosts = []
  db.calls = []
  db.storageFiles = {
    'site-images/products/p1': ['a.png', 'b.png'],
    'site-images/ai-candidates/p1': ['c.png'],
    'site-images/previews/user-1': ['d.png'],
    'site-images/products/p9': ['keep.png'],
    'support-attachments/t1': ['f1'],
  }
  db.tables = {
    projects: [
      { id: 'p1', owner_id: 'user-1', published: true, slug: 'kahve' },
      { id: 'p2', owner_id: 'user-1', published: false, slug: 'taslak' },
      { id: 'p9', owner_id: 'user-2', published: true, slug: 'baska' },
    ],
    content_attestations: [{ id: 'ca1', project_id: 'p1' }],
    signup_drafts: [
      { id: 'd1', email: EMAIL, claimed_by: 'user-1' },
      { id: 'd2', email: EMAIL, claimed_by: null },
      { id: 'd3', email: 'other@example.com', claimed_by: null },
    ],
    ecommerce_orders: [],
    ecommerce_order_items: [],
    billing_subscriptions: [{ id: 's1', user_id: 'user-1', plan: 'FREE' }],
    billing_transactions: [],
    addon_purchases: [],
    domain_orders: [],
    custom_domains: [],
    support_tickets: [{ id: 't1', user_id: 'user-1' }],
    support_ticket_attachments: [{ id: 'att1', ticket_id: 't1', storage_path: 't1/f1' }],
  }
}

function seedPaidAccount() {
  seedFreeAccount()
  db.tables.billing_subscriptions = [{ id: 's1', user_id: 'user-1', plan: 'PRO' }]
  db.tables.billing_transactions = [{ id: 'tx1', user_id: 'user-1', amount: 99900, status: 'succeeded' }]
  db.tables.addon_purchases = [{ id: 'ap1', user_id: 'user-1', amount: 1000, status: 'granted' }]
  db.tables.domain_orders = [{ id: 'do1', user_id: 'user-1', status: 'active' }]
  db.tables.custom_domains = [{ id: 'cd1', user_id: 'user-1', domain: 'firma.com' }]
  db.tables.ecommerce_orders = [
    { id: 'o1', owner_id: 'user-1', project_id: 'p1', total: 250 },
    { id: 'o2', owner_id: 'user-2', project_id: 'p9', total: 90 },
  ]
  db.tables.ecommerce_order_items = [
    { id: 'i1', project_id: 'p1', order_id: 'o1' },
    { id: 'i2', project_id: 'p9', order_id: 'o2' },
  ]
}

function adminClient() {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      let patch: Row | null = null
      let deleting = false
      const rows = () => (db.tables[table] ??= [])
      const run = (): { data: Row[] | null; error: Err } => {
        db.calls.push(`${patch ? 'update' : deleting ? 'delete' : 'select'}:${table}`)
        if (db.failOn === table) return { data: null, error: { code: 'XX000', message: 'boom' } }
        const hit = rows().filter((r) => filters.every((f) => f(r)))
        if (patch) {
          for (const col of Object.keys(patch)) {
            if (patch[col] === null && db.notNull.has(`${table}.${col}`) && hit.length > 0) {
              return {
                data: null,
                error: {
                  code: '23502',
                  message: `null value in column "${col}" of relation "${table}" violates not-null constraint`,
                },
              }
            }
          }
          hit.forEach((r) => Object.assign(r, patch))
        }
        if (deleting) db.tables[table] = rows().filter((r) => !hit.includes(r))
        return { data: hit, error: null }
      }
      const builder: any = {
        select: () => builder,
        update: (p: Row) => {
          patch = p
          return builder
        },
        delete: () => {
          deleting = true
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
        gte: (col: string, val: string) => {
          filters.push((r) => typeof r[col] === 'string' && r[col] >= val)
          return builder
        },
        then: (resolve: (v: unknown) => void) => resolve(run()),
      }
      return builder
    },
    storage: {
      from(bucket: string) {
        return {
          list: async (prefix: string) => {
            db.calls.push(`list:${bucket}/${prefix}`)
            if (db.storageFailOn === 'list') return { data: null, error: { message: 'storage down' } }
            return { data: (db.storageFiles[`${bucket}/${prefix}`] ?? []).map((name) => ({ name })), error: null }
          },
          remove: async (paths: string[]) => {
            db.calls.push(`remove:${bucket}`)
            if (db.storageFailOn === 'remove') return { data: null, error: { message: 'storage down' } }
            for (const key of Object.keys(db.storageFiles)) {
              if (!key.startsWith(`${bucket}/`)) continue
              const dir = key.slice(bucket.length + 1)
              db.storageFiles[key] = db.storageFiles[key].filter((n) => !paths.includes(`${dir}/${n}`))
            }
            return { data: [], error: null }
          },
        }
      },
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          db.calls.push('deleteUser')
          if (db.deleteUserError) return { error: { message: db.deleteUserError, status: 500, name: 'AuthApiError' } }
          // auth.users cascades to owned data; retained financial rows become user_id = NULL (SET NULL).
          const goneProjects = db.tables.projects.filter((p) => p.owner_id === id).map((p) => p.id)
          db.tables.projects = db.tables.projects.filter((p) => p.owner_id !== id)
          for (const t of ['content_attestations', 'support_tickets', 'custom_domains']) {
            db.tables[t] = db.tables[t].filter(
              (r) => r.user_id !== id && !goneProjects.includes(r.project_id),
            )
          }
          db.tables.signup_drafts = db.tables.signup_drafts.filter((d) => d.claimed_by !== id)
          db.tables.ecommerce_orders = db.tables.ecommerce_orders.map((o) => ({
            ...o,
            owner_id: o.owner_id === id ? null : o.owner_id,
            project_id: goneProjects.includes(o.project_id) ? null : o.project_id,
          }))
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
vi.mock('@/lib/custom-domains/vercel', () => ({
  getVercelClient: () => ({
    removeDomain: async (host: string) => {
      db.removedHosts.push(host)
      return { ok: true, alreadyAbsent: false }
    },
  }),
}))

import { deleteOwnAccount } from '@/lib/account'

let errorLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  seedFreeAccount()
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorLog.mockRestore())

describe('deleteOwnAccount', () => {
  it('refuses anonymous callers before touching any data', async () => {
    db.user = null
    expect(await deleteOwnAccount()).toEqual({ ok: false, error: 'not_authenticated' })
    expect(db.calls).toEqual([])
  })

  it('deletes a FREE account with a published site, an attestation and signup drafts', async () => {
    expect(await deleteOwnAccount()).toEqual({ ok: true })
    expect(db.tables.projects.filter((p) => p.owner_id === 'user-1')).toHaveLength(0)
    expect(db.tables.content_attestations).toHaveLength(0)
    expect(db.tables.signup_drafts.map((d) => d.id)).toEqual(['d3'])
    expect(db.tables.billing_subscriptions).toEqual([{ id: 's1', user_id: null, plan: 'FREE' }])
    expect(errorLog).not.toHaveBeenCalled()
  })

  it('takes the owner published sites down with the account', async () => {
    expect(db.tables.projects.filter((p) => p.owner_id === 'user-1' && p.published)).toHaveLength(1)
    await deleteOwnAccount()
    expect(db.tables.projects.filter((p) => p.owner_id === 'user-1')).toHaveLength(0)
    expect(db.tables.projects.some((p) => p.id === 'p9')).toBe(true)
  })

  it('clears site, preview and support files, and leaves other owners files alone', async () => {
    await deleteOwnAccount()
    expect(db.storageFiles['site-images/products/p1']).toEqual([])
    expect(db.storageFiles['site-images/ai-candidates/p1']).toEqual([])
    expect(db.storageFiles['site-images/previews/user-1']).toEqual([])
    expect(db.storageFiles['support-attachments/t1']).toEqual([])
    expect(db.storageFiles['site-images/products/p9']).toEqual(['keep.png'])
  })

  it('removes storage only after the account itself is gone', async () => {
    await deleteOwnAccount()
    expect(db.calls.indexOf('deleteUser')).toBeLessThan(db.calls.findIndex((c) => c.startsWith('remove:')))
  })

  it('does not fail the deletion when storage cleanup fails, and logs without personal data', async () => {
    db.storageFailOn = 'list'
    expect(await deleteOwnAccount()).toEqual({ ok: true })
    const logged = JSON.stringify(errorLog.mock.calls)
    expect(logged).toContain('cleanup step failed')
    expect(logged).not.toContain(EMAIL)
    expect(logged).not.toContain('user-1')
  })

  describe('paid plan with payment records', () => {
    beforeEach(seedPaidAccount)

    it('retains payments, orders and purchases but detaches them from the user', async () => {
      expect(await deleteOwnAccount()).toEqual({ ok: true })
      expect(db.tables.billing_subscriptions[0]).toMatchObject({ plan: 'PRO', user_id: null })
      expect(db.tables.billing_transactions[0]).toMatchObject({ amount: 99900, status: 'succeeded', user_id: null })
      expect(db.tables.addon_purchases[0]).toMatchObject({ amount: 1000, user_id: null })
      expect(db.tables.domain_orders[0]).toMatchObject({ status: 'active', user_id: null })
      expect(db.tables.ecommerce_orders.find((o) => o.id === 'o1')).toMatchObject({
        owner_id: null,
        project_id: null,
        total: 250,
      })
      expect(db.tables.ecommerce_order_items.find((i) => i.id === 'i1')).toMatchObject({ project_id: null })
    })

    it('anonymizes before the destructive step', async () => {
      await deleteOwnAccount()
      for (const table of ['ecommerce_orders', 'billing_subscriptions', 'billing_transactions', 'addon_purchases', 'domain_orders']) {
        expect(db.calls.indexOf(`update:${table}`)).toBeLessThan(db.calls.indexOf('deleteUser'))
      }
    })

    it('leaves other owners records untouched', async () => {
      await deleteOwnAccount()
      expect(db.tables.ecommerce_orders.find((o) => o.id === 'o2')).toMatchObject({ owner_id: 'user-2', project_id: 'p9' })
      expect(db.tables.ecommerce_order_items.find((i) => i.id === 'i2')?.project_id).toBe('p9')
    })

    it('detaches custom domains (apex and www) from hosting', async () => {
      await deleteOwnAccount()
      expect(db.removedHosts.sort()).toEqual(['firma.com', 'www.firma.com'])
    })
  })

  describe('before the retention migration (columns still NOT NULL)', () => {
    it('aborts BEFORE deleting the user and logs the real cause', async () => {
      db.notNull = new Set(['billing_subscriptions.user_id'])
      expect(await deleteOwnAccount()).toEqual({ ok: false, error: 'delete_failed' })
      expect(db.calls).not.toContain('deleteUser')
      expect(db.tables.projects.filter((p) => p.owner_id === 'user-1')).toHaveLength(2)
      expect(errorLog).toHaveBeenCalledWith('[account-delete] stage failed', {
        stage: 'anonymize_billing_subscriptions',
        code: '23502',
        status: null,
        name: null,
        table: 'billing_subscriptions',
        column: 'user_id',
        constraint: null,
      })
    })
  })

  it.each(['projects', 'ecommerce_orders', 'billing_subscriptions', 'billing_transactions', 'addon_purchases', 'domain_orders'])(
    'stops before deleting the user when the %s query fails',
    async (table) => {
      seedPaidAccount()
      db.failOn = table
      expect(await deleteOwnAccount()).toEqual({ ok: false, error: 'delete_failed' })
      expect(db.calls).not.toContain('deleteUser')
      expect(db.tables.projects.filter((p) => p.owner_id === 'user-1')).toHaveLength(2)
      expect(db.tables.ecommerce_orders.find((o) => o.id === 'o1')).toBeDefined()
      expect(errorLog).toHaveBeenCalled()
    },
  )

  describe('registrar domains', () => {
    beforeEach(seedPaidAccount)

    it('does not block on history: active orders and completed transfers of a former owner', async () => {
      db.tables.domain_orders = [{ id: 'do1', user_id: 'user-1', status: 'active' }]
      db.tables.domain_transfers = [{ id: 'dt1', user_id: 'user-1', status: 'completed' }]
      db.tables.domain_renewals = [{ id: 'dr1', user_id: 'user-1', status: 'completed' }]
      db.tables.custom_domains = []
      expect(await deleteOwnAccount()).toEqual({ ok: true })
    })

    it('blocks while the user still holds a domainnameapi domain, before touching any data', async () => {
      db.tables.custom_domains = [{ id: 'cd1', user_id: 'user-1', domain: 'firma.com', provider: 'domainnameapi' }]
      expect(await deleteOwnAccount()).toEqual({ ok: false, error: 'domains_block_deletion' })
      expect(db.calls.some((c) => c.startsWith('update:') || c === 'deleteUser')).toBe(false)
    })

    it('does not block on a domain held by someone else or on another provider', async () => {
      db.tables.custom_domains = [
        { id: 'cd1', user_id: 'user-2', domain: 'baska.com', provider: 'domainnameapi' },
        { id: 'cd2', user_id: 'user-1', domain: 'firma.com', provider: 'supabase' },
      ]
      expect(await deleteOwnAccount()).toEqual({ ok: true })
    })

    it.each([
      ['domain_orders', 'payment_verified'],
      ['domain_orders', 'registration_pending'],
      ['domain_transfers', 'payment_verified'],
      ['domain_transfers', 'transfer_submitting'],
      ['domain_transfers', 'transfer_pending'],
      ['domain_renewals', 'payment_verified'],
      ['domain_renewals', 'renewal_submitting'],
      ['domain_renewals', 'renewal_reconciliation_required'],
      ['domain_renewals', 'manual_refund_required'],
    ])('blocks on an open %s row in status %s, without touching any data', async (table, status) => {
      db.tables.custom_domains = []
      db.tables[table] = [{ id: 'x1', user_id: 'user-1', status }]
      expect(await deleteOwnAccount()).toEqual({ ok: false, error: 'domains_block_deletion' })
      expect(db.calls.some((c) => c.startsWith('update:') || c.startsWith('delete:') || c === 'deleteUser')).toBe(false)
    })

    it.each(['domain_orders', 'domain_transfers', 'domain_renewals'])(
      'does not block on terminal %s statuses',
      async (table) => {
        db.tables.custom_domains = []
        db.tables[table] = ['active', 'completed', 'failed', 'cancelled', 'registration_failed'].map((status, i) => ({
          id: `t${i}`,
          user_id: 'user-1',
          status,
        }))
        expect(await deleteOwnAccount()).toEqual({ ok: true })
      },
    )

    describe('pending_payment window', () => {
      const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

      it.each(['domain_orders', 'domain_transfers', 'domain_renewals'])(
        'blocks on a %s pending_payment row created 30 minutes ago',
        async (table) => {
          db.tables.custom_domains = []
          db.tables[table] = [{ id: 'p1', user_id: 'user-1', status: 'pending_payment', created_at: minutesAgo(30) }]
          expect(await deleteOwnAccount()).toEqual({ ok: false, error: 'domains_block_deletion' })
          expect(db.calls).not.toContain('deleteUser')
        },
      )

      it.each(['domain_orders', 'domain_transfers', 'domain_renewals'])(
        'does not block on a %s pending_payment row older than 2 hours',
        async (table) => {
          db.tables.custom_domains = []
          db.tables[table] = [{ id: 'p1', user_id: 'user-1', status: 'pending_payment', created_at: minutesAgo(180) }]
          expect(await deleteOwnAccount()).toEqual({ ok: true })
        },
      )

      it('does not block on a recent pending_payment row of another user', async () => {
        db.tables.custom_domains = []
        db.tables.domain_orders = [{ id: 'p1', user_id: 'user-2', status: 'pending_payment', created_at: minutesAgo(5) }]
        expect(await deleteOwnAccount()).toEqual({ ok: true })
      })
    })

    describe('expired registrar domains', () => {
      const dayMs = 24 * 60 * 60 * 1000
      const domainRow = (expires_at: string | null) => ({
        id: 'cd1',
        user_id: 'user-1',
        domain: 'firma.com',
        provider: 'domainnameapi',
        expires_at,
      })

      it('does not block on a domain whose registration expired in the past', async () => {
        db.tables.custom_domains = [domainRow(new Date(Date.now() - dayMs).toISOString())]
        expect(await deleteOwnAccount()).toEqual({ ok: true })
      })

      it('still blocks on a domain that has not expired yet', async () => {
        db.tables.custom_domains = [domainRow(new Date(Date.now() + dayMs).toISOString())]
        expect(await deleteOwnAccount()).toEqual({ ok: false, error: 'domains_block_deletion' })
      })

      it.each([null, 'not-a-date'])('keeps blocking when expires_at is %s (fail closed)', async (value) => {
        db.tables.custom_domains = [domainRow(value)]
        expect(await deleteOwnAccount()).toEqual({ ok: false, error: 'domains_block_deletion' })
      })

      it('blocks an expired domain while a renewal for it is open', async () => {
        db.tables.custom_domains = [domainRow(new Date(Date.now() - dayMs).toISOString())]
        db.tables.domain_renewals = [{ id: 'r1', user_id: 'user-1', domain: 'firma.com', status: 'renewal_submitting' }]
        expect(await deleteOwnAccount()).toEqual({ ok: false, error: 'domains_block_deletion' })
        expect(db.calls).not.toContain('deleteUser')
      })
    })

    it.each(['custom_domains', 'domain_orders', 'domain_transfers', 'domain_renewals'])(
      'fails closed when the %s guard query fails',
      async (table) => {
        db.failOn = table
        expect(await deleteOwnAccount()).toEqual({ ok: false, error: 'delete_failed' })
        expect(db.calls).not.toContain('deleteUser')
      },
    )
  })

  it('reports delete_failed and logs a safe reason when the auth deletion itself fails', async () => {
    db.deleteUserError = 'auth down'
    expect(await deleteOwnAccount()).toEqual({ ok: false, error: 'delete_failed' })
    expect(errorLog).toHaveBeenCalledWith(
      '[account-delete] stage failed',
      expect.objectContaining({ stage: 'auth_delete_user', status: 500, name: 'AuthApiError' }),
    )
    expect(db.calls.some((c) => c.startsWith('remove:'))).toBe(false)
  })
})
