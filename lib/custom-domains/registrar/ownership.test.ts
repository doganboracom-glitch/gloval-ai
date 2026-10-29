import { beforeEach, describe, expect, it, vi } from 'vitest'

type Filter = Record<string, unknown>
type Result = { data: unknown; error: unknown }

const m = vi.hoisted(() => ({
  mine: [] as Array<{ id: string; domain: string; source: string }>,
  linkOrderId: 'ord-1' as string | null,
  orders: [] as Array<{ id: string; domain: string; status: string; user_id: string }>,
  transfers: [] as Array<{ id: string; domain: string; status: string; user_id: string }>,
  failOrders: false,
  filters: [] as Array<{ table: string; filter: Record<string, unknown> }>,
}))

vi.mock('../service', () => ({ listDomainsForUser: async () => m.mine }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const filter: Filter = {}
      const run = (): Result => {
        m.filters.push({ table, filter: { ...filter } })
        if (table === 'custom_domains') return { data: { order_id: m.linkOrderId }, error: null }
        if (table === 'domain_orders' && m.failOrders) return { data: null, error: { message: 'boom' } }
        const rows = table === 'domain_orders' ? m.orders : m.transfers
        const hit = rows.filter((r) => Object.entries(filter).every(([k, v]) => (r as Record<string, unknown>)[k] === v))
        return { data: hit.map((r) => ({ id: r.id })), error: null }
      }
      const chain = {
        select: () => chain,
        eq: (k: string, v: unknown) => {
          filter[k] = v
          return chain
        },
        limit: () => Promise.resolve(run()),
        maybeSingle: () => Promise.resolve(run()),
      }
      return chain
    },
  }),
}))

import { requireRegisteredByUs } from './ownership'

describe('requireRegisteredByUs', () => {
  beforeEach(() => {
    m.mine = [{ id: 'cd-1', domain: 'example.com', source: 'registrar' }]
    m.linkOrderId = 'ord-1'
    m.orders = [{ id: 'ord-1', domain: 'example.com', status: 'active', user_id: 'old-owner' }]
    m.transfers = []
    m.failOrders = false
    m.filters = []
  })

  it('accepts the new owner when the proving order belongs to the previous owner', async () => {
    expect(await requireRegisteredByUs('new-owner', ' Example.COM ')).toBe('example.com')
  })

  it('never filters the proof lookup by user', async () => {
    await requireRegisteredByUs('new-owner', 'example.com')
    const proof = m.filters.filter((f) => f.table === 'domain_orders' || f.table === 'domain_transfers')
    expect(proof.length).toBe(2)
    for (const f of proof) expect(f.filter).not.toHaveProperty('user_id')
  })

  it('accepts a completed inbound transfer as proof', async () => {
    m.orders = []
    m.transfers = [{ id: 'ord-1', domain: 'example.com', status: 'completed', user_id: 'u' }]
    expect(await requireRegisteredByUs('u', 'example.com')).toBe('example.com')
  })

  it('rejects a domain the caller does not hold', async () => {
    m.mine = []
    expect(await requireRegisteredByUs('u', 'example.com')).toBeNull()
  })

  it('rejects an externally connected domain', async () => {
    m.mine = [{ id: 'cd-1', domain: 'example.com', source: 'external' }]
    expect(await requireRegisteredByUs('u', 'example.com')).toBeNull()
  })

  it('rejects a row with no order link', async () => {
    m.linkOrderId = null
    expect(await requireRegisteredByUs('u', 'example.com')).toBeNull()
  })

  it('rejects when the linked order is not active or is for another domain', async () => {
    m.orders = [{ id: 'ord-1', domain: 'example.com', status: 'failed', user_id: 'u' }]
    expect(await requireRegisteredByUs('u', 'example.com')).toBeNull()
    m.orders = [{ id: 'ord-1', domain: 'other.com', status: 'active', user_id: 'u' }]
    expect(await requireRegisteredByUs('u', 'example.com')).toBeNull()
  })

  it('fails closed on a lookup error', async () => {
    m.failOrders = true
    expect(await requireRegisteredByUs('u', 'example.com')).toBeNull()
  })
})
