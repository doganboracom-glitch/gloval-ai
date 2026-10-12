import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/notify', () => ({ claimNotification: vi.fn(), sendTransactionalEmail: vi.fn() }))
vi.mock('@/lib/store-order-notifications', () => ({ findContactEmail: vi.fn(() => '') }))

type Result = { data?: unknown; error?: { code?: string; message?: string } | null }
type Call = { table: string; op: string; payload?: unknown }

const calls: Call[] = []
let handler: (table: string, op: string) => Result = () => ({ data: [], error: null })

function builder(table: string) {
  let op = 'select'
  let payload: unknown
  const run = (): Result => {
    calls.push({ table, op, payload })
    return handler(table, op)
  }
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    is: () => b,
    not: () => b,
    in: () => b,
    update: (p: unknown) => {
      op = 'update'
      payload = p
      return b
    },
    insert: (p: unknown) => {
      op = 'insert'
      payload = p
      return Promise.resolve(run())
    },
    maybeSingle: () => Promise.resolve(run()),
    then: (resolve: (v: Result) => unknown) => resolve(run()),
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: builder }) }))

import { anonymizeStoreCustomer, deletedCustomerOrderIds } from '@/lib/store-customer-deletion'

const input = { projectId: 'p1', customerId: 'c1', event: 'deleted_by_customer' as const }

beforeEach(() => {
  calls.length = 0
  handler = () => ({ data: [], error: null })
})

describe('anonymizeStoreCustomer', () => {
  it('returns not_found for an unknown customer', async () => {
    handler = (t) => (t === 'store_customers' ? { data: null, error: null } : { data: [], error: null })
    expect(await anonymizeStoreCustomer(input)).toEqual({ ok: false, reason: 'not_found' })
  })

  it('is idempotent for an already deleted customer', async () => {
    handler = () => ({ data: { id: 'c1', email: 'x', name: 'y', deleted_at: '2026-01-01' }, error: null })
    expect(await anonymizeStoreCustomer(input)).toEqual({ ok: false, reason: 'already_deleted' })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('refuses while an order is in flight and writes nothing', async () => {
    handler = (t, op) => {
      if (t === 'store_customers') return { data: { id: 'c1', email: 'a@b.com', name: 'A', deleted_at: null }, error: null }
      if (t === 'ecommerce_orders') return { data: [{ status: 'paid', payment_status: 'paid', shipping_status: 'preparing' }], error: null }
      return { data: [], error: null, ...(op ? {} : {}) }
    }
    expect(await anonymizeStoreCustomer(input)).toEqual({ ok: false, reason: 'blocked' })
    expect(calls.some((c) => c.op === 'update' || c.op === 'insert')).toBe(false)
  })

  it('reports migration_pending when the schema is missing', async () => {
    handler = () => ({ data: null, error: { code: '42703', message: 'column deleted_at does not exist' } })
    expect(await anonymizeStoreCustomer(input)).toEqual({ ok: false, reason: 'migration_pending' })
  })

  it('anonymizes, records an audit event and returns the previous contact', async () => {
    handler = (t, op) => {
      if (t === 'store_customers' && op === 'select')
        return { data: { id: 'c1', email: 'a@b.com', name: 'Ayşe', deleted_at: null }, error: null }
      if (t === 'store_customers' && op === 'update') return { data: [{ id: 'c1' }], error: null }
      if (t === 'ecommerce_orders') return { data: [{ status: 'completed', payment_status: 'paid' }], error: null }
      return { data: null, error: null }
    }
    const res = await anonymizeStoreCustomer({ ...input, actorUserId: 'owner-1' })
    expect(res).toEqual({ ok: true, previousEmail: 'a@b.com', previousName: 'Ayşe' })
    const update = calls.find((c) => c.op === 'update')?.payload as Record<string, unknown>
    expect(update.email).toBe('deleted+c1@invalid.local')
    expect(update.password_hash).toBe('')
    expect(update.deleted_at).toBeTruthy()
    const event = calls.find((c) => c.table === 'store_customer_events')?.payload as Record<string, unknown>
    expect(event).toMatchObject({ project_id: 'p1', customer_id: 'c1', event: 'deleted_by_customer', actor_user_id: 'owner-1' })
    expect(JSON.stringify(event)).not.toContain('a@b.com')
  })

  it('treats a lost race (no row updated) as already_deleted', async () => {
    handler = (t, op) => {
      if (t === 'store_customers' && op === 'select')
        return { data: { id: 'c1', email: 'a@b.com', name: 'A', deleted_at: null }, error: null }
      if (t === 'store_customers' && op === 'update') return { data: [], error: null }
      return { data: [], error: null }
    }
    expect(await anonymizeStoreCustomer(input)).toEqual({ ok: false, reason: 'already_deleted' })
  })
})

describe('deletedCustomerOrderIds', () => {
  it('returns only orders whose customer was deleted', async () => {
    handler = (t) => {
      if (t === 'ecommerce_orders')
        return {
          data: [
            { id: 'o1', customer_id: 'c1' },
            { id: 'o2', customer_id: 'c2' },
            { id: 'o3', customer_id: null },
          ],
          error: null,
        }
      return { data: [{ id: 'c1' }], error: null }
    }
    expect([...(await deletedCustomerOrderIds('p1', ['o1', 'o2', 'o3']))]).toEqual(['o1'])
  })

  it('fails soft and skips the query for no orders', async () => {
    expect((await deletedCustomerOrderIds('p1', [])).size).toBe(0)
    expect(calls).toHaveLength(0)
    handler = () => ({ data: null, error: { code: '42703' } })
    expect((await deletedCustomerOrderIds('p1', ['o1'])).size).toBe(0)
  })
})
