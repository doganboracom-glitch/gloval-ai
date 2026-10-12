import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const O1 = '11111111-1111-4111-8111-111111111111'
const O2 = '22222222-2222-4222-8222-222222222222'
const OTHER_PROJECT_ORDER = '33333333-3333-4333-8333-333333333333'
const OTHER_CUSTOMER_ORDER = '44444444-4444-4444-8444-444444444444'

type Log = { id: string; dedupe_key: string | null; type: string; status: string; subject: string; body: string | null }
type Order = { id: string; project_id: string; customer_id: string }

let orders: Order[] = []
let logs: Log[] = []
let failOrders = false
let failUpdatesLeft = 0
let updateCalls = 0

function ordersBuilder() {
  const eqs: Record<string, unknown> = {}
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (k: string, v: unknown) => ((eqs[k] = v), b),
    limit: () => b,
    then: (resolve: (v: unknown) => unknown) =>
      resolve(
        failOrders
          ? { data: null, error: { code: 'XX000' } }
          : { data: orders.filter((o) => Object.entries(eqs).every(([k, v]) => (o as Record<string, unknown>)[k] === v)).map((o) => ({ id: o.id })), error: null },
      ),
  }
  return b
}

function logsBuilder() {
  let patch: Record<string, unknown> = {}
  let prefixes: string[] = []
  let typePrefix = ''
  let requireBody = false
  const b: Record<string, unknown> = {
    update: (p: Record<string, unknown>) => ((patch = p), b),
    or: (f: string) => ((prefixes = f.split(',').map((s) => s.replace(/^dedupe_key\.like\./, '').replace(/\*$/, ''))), b),
    like: (_c: string, v: string) => ((typePrefix = v.replace(/\*$/, '')), b),
    not: () => ((requireBody = true), b),
    select: () => b,
    then: (resolve: (v: unknown) => unknown) => {
      updateCalls += 1
      if (failUpdatesLeft > 0) {
        failUpdatesLeft -= 1
        return resolve({ data: null, error: { code: 'XX000' } })
      }
      const hit = logs.filter(
        (l) =>
          l.dedupe_key !== null &&
          prefixes.some((p) => (l.dedupe_key as string).startsWith(p)) &&
          l.type.startsWith(typePrefix) &&
          (!requireBody || l.body !== null),
      )
      for (const l of hit) Object.assign(l, patch)
      return resolve({ data: hit.map((l) => ({ id: l.id })), error: null })
    },
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => (t === 'ecommerce_orders' ? ordersBuilder() : logsBuilder()) }),
}))

import { scrubCustomerNotificationLogs } from '@/lib/store-customer-notification-scrub'
import { buildNotificationScrubPatch, isSafeOrderId, orderNotificationOrFilter } from '@/lib/store-customer-privacy'

const log = (id: string, orderId: string, role: string, body: string | null, type = 'store_order_buyer'): Log => ({
  id,
  dedupe_key: `store-order:${orderId}:${role}`,
  type,
  status: 'sent',
  subject: 'Store order email',
  body,
})

beforeEach(() => {
  failOrders = false
  failUpdatesLeft = 0
  updateCalls = 0
  orders = [
    { id: O1, project_id: 'p1', customer_id: 'c1' },
    { id: O2, project_id: 'p1', customer_id: 'c1' },
    { id: OTHER_PROJECT_ORDER, project_id: 'p2', customer_id: 'c1' },
    { id: OTHER_CUSTOMER_ORDER, project_id: 'p1', customer_id: 'c2' },
  ]
  logs = [
    log('l1', O1, 'buyer', 'Dear a@b.com'),
    log('l2', O1, 'owner', null, 'store_order_owner'),
    log('l3', O2, 'shipped', 'tracking for a@b.com', 'store_order_shipped'),
    log('l4', OTHER_PROJECT_ORDER, 'buyer', 'Dear a@b.com'),
    log('l5', OTHER_CUSTOMER_ORDER, 'buyer', 'Dear z@y.com'),
    { id: 'l6', dedupe_key: `store-order:${O1}:buyer-x`, type: 'welcome_email', status: 'sent', subject: 's', body: 'keep' },
  ]
})

describe('scrub patch', () => {
  it('clears only the body, never the dedupe key or audit columns', () => {
    expect(buildNotificationScrubPatch()).toEqual({ body: null })
  })

  it('only builds filters from UUID order ids', () => {
    expect(isSafeOrderId(O1)).toBe(true)
    expect(isSafeOrderId('x),dedupe_key.like.*')).toBe(false)
    expect(orderNotificationOrFilter([O1, O2])).toBe(
      `dedupe_key.like.store-order:${O1}:*,dedupe_key.like.store-order:${O2}:*`,
    )
  })
})

describe('scrubCustomerNotificationLogs', () => {
  it('clears the body of this customer\'s order logs and keeps everything else', async () => {
    const before = logs.map((l) => ({ ...l }))
    expect(await scrubCustomerNotificationLogs('p1', 'c1')).toEqual({ ok: true, scrubbed: 2 })

    const byId = Object.fromEntries(logs.map((l) => [l.id, l]))
    expect(byId.l1.body).toBeNull()
    expect(byId.l3.body).toBeNull()
    for (const l of logs) {
      const prev = before.find((p) => p.id === l.id)!
      expect({ ...l, body: 0 }).toEqual({ ...prev, body: 0 })
    }
  })

  it('does not touch another project, another customer or non-store log types', async () => {
    await scrubCustomerNotificationLogs('p1', 'c1')
    const byId = Object.fromEntries(logs.map((l) => [l.id, l]))
    expect(byId.l4.body).toBe('Dear a@b.com')
    expect(byId.l5.body).toBe('Dear z@y.com')
    expect(byId.l6.body).toBe('keep')
  })

  it('is idempotent', async () => {
    await scrubCustomerNotificationLogs('p1', 'c1')
    expect(await scrubCustomerNotificationLogs('p1', 'c1')).toEqual({ ok: true, scrubbed: 0 })
  })

  it('does nothing for a customer without orders', async () => {
    expect(await scrubCustomerNotificationLogs('p1', 'nobody')).toEqual({ ok: true, scrubbed: 0 })
    expect(updateCalls).toBe(0)
  })

  it('retries once after a transient failure', async () => {
    failUpdatesLeft = 1
    expect(await scrubCustomerNotificationLogs('p1', 'c1')).toEqual({ ok: true, scrubbed: 2 })
  })

  it('reports failure without throwing and logs ids only', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    failOrders = true
    expect(await scrubCustomerNotificationLogs('p1', 'c1')).toEqual({ ok: false })
    expect(spy).toHaveBeenCalled()
    expect(JSON.stringify(spy.mock.calls)).not.toContain('@')
    spy.mockRestore()
  })
})
