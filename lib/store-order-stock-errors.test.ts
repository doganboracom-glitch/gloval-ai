import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  StockReleaseError,
  finalizePaidStock,
  releaseOrderStock,
  releaseOrderStockSafely,
  releaseOrphanedStock,
  releaseStaleOrderStock,
} from '@/lib/store-order-stock'
import { createQueryFake, type QueryCall, type QueryResult } from '@/lib/test-support/query-fake'

describe('releaseOrderStock', () => {
  it('throws StockReleaseError when the database refuses the release', async () => {
    const { client } = createQueryFake(
      () => ({ data: null }),
      () => ({ error: { code: '57014' } }),
    )
    await expect(releaseOrderStock(client, 'o1')).rejects.toBeInstanceOf(StockReleaseError)
  })

  it('treats a missing function as nothing to release', async () => {
    const { client } = createQueryFake(
      () => ({ data: null }),
      () => ({ error: { code: '42883' } }),
    )
    await expect(releaseOrderStock(client, 'o1')).resolves.toBeUndefined()
  })

  it('passes the onlyUnpaid guard to the database', async () => {
    const { client, rpcCalls } = createQueryFake(() => ({ data: null }))
    await releaseOrderStock(client, 'o1', { onlyUnpaid: true })
    expect(rpcCalls[0]).toEqual({
      name: 'release_order_stock',
      args: { p_order_id: 'o1', p_only_unpaid: true },
    })
  })

  it('the safe variant reports false instead of throwing', async () => {
    const { client } = createQueryFake(
      () => ({ data: null }),
      () => ({ error: { code: '57014' } }),
    )
    expect(await releaseOrderStockSafely(client, 'o1')).toBe(false)
  })
})

describe('releaseOrphanedStock', () => {
  it('releases each orphan with the unpaid guard and counts the successes', async () => {
    const { client, rpcCalls } = createQueryFake(
      (c) => (c.table === 'ecommerce_orders' && c.op === 'select' && !c.single && c.columns === 'id'
        ? { data: [{ id: 'a' }, { id: 'b' }] }
        : { data: null }),
      (_n, args) => (args.p_order_id === 'b' ? { error: { code: '57014' } } : { data: null }),
    )
    expect(await releaseOrphanedStock(client, 'p1')).toBe(1)
    expect(rpcCalls.every((r) => r.args.p_only_unpaid === true)).toBe(true)
  })

  it('returns 0 when the lookup fails', async () => {
    const { client, rpcCalls } = createQueryFake(() => ({ error: { code: '57014' } }))
    expect(await releaseOrphanedStock(client, null)).toBe(0)
    expect(rpcCalls).toHaveLength(0)
  })
})

describe('releaseStaleOrderStock', () => {
  function stale(respond: (c: QueryCall) => QueryResult | undefined) {
    return createQueryFake((c) => respond(c) ?? { data: [] })
  }

  it('skips an order whose cancel failed and continues with the next', async () => {
    const { client, rpcCalls } = stale((c) => {
      if (c.op === 'select' && c.filters.some((f) => f.column === 'status' && f.value === 'pending')) {
        return { data: [{ id: 'a' }, { id: 'b' }] }
      }
      if (c.op === 'update') {
        const id = c.filters.find((f) => f.column === 'id')?.value
        return id === 'a' ? { error: { code: '40001' } } : { data: [{ id: 'b' }] }
      }
      return undefined
    })
    await releaseStaleOrderStock(client, 'p1')
    expect(rpcCalls.map((r) => r.args.p_order_id)).toEqual(['b'])
  })

  it('does nothing when the stale lookup fails', async () => {
    const { client, calls } = createQueryFake(() => ({ error: { code: '57014' } }))
    await releaseStaleOrderStock(client, 'p1')
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0)
  })
})

describe('finalizePaidStock', () => {
  it('reports stockFailed (not oversold) on a database error', async () => {
    const { client } = createQueryFake(
      () => ({ data: null }),
      () => ({ error: { code: '57014' } }),
    )
    expect(await finalizePaidStock(client, 'o1')).toMatchObject({ oversold: false, stockFailed: true })
  })

  it('reports oversold for a genuine shortage, which is not a failure', async () => {
    const { client } = createQueryFake(
      () => ({ data: null }),
      () => ({ data: { ok: false, error: 'insufficient_stock', product_id: 'p9' } }),
    )
    const res = await finalizePaidStock(client, 'o1')
    expect(res.oversold).toBe(true)
    expect(res.stockFailed).toBeUndefined()
  })

  it('is a clean no-op when the stock was already reserved', async () => {
    const { client } = createQueryFake(
      () => ({ data: null }),
      () => ({ data: { ok: true, already: true } }),
    )
    expect(await finalizePaidStock(client, 'o1')).toEqual({ oversold: false })
  })
})
