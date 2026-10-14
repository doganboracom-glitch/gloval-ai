import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/store-order-stock', () => ({
  finalizePaidStock: vi.fn(),
  releaseOrderStock: vi.fn(),
}))
vi.mock('@/lib/store-order-notifications', () => ({ scheduleOrderNotification: vi.fn() }))
vi.mock('@/lib/store-payments/iyzico-credentials', () => ({ loadIyzicoCredentials: vi.fn() }))

import { settleIyzicoOrder, type SettleOrder } from '@/lib/store-payments/iyzico-settle'
import type { StoreWebhookDeps } from '@/lib/store-webhook-handler'
import type { IyzicoCredentials } from '@/lib/store-payments/iyzico'

type Row = Record<string, unknown> & {
  id: string
  project_id: string
  payment_ref: string
  payment_provider: string
  payment_status: string
  status: string
  total_cents: number
  currency: string
}

type Filter = { op: 'eq' | 'neq'; column: string; value: unknown }

/** In-memory stand-in for the Supabase builder: conditional updates only change a matching row. */
function fakeAdmin(row: Row) {
  const matches = (filters: Filter[]) =>
    filters.every((f) => (f.op === 'eq' ? row[f.column] === f.value : row[f.column] !== f.value))

  function builder() {
    const filters: Filter[] = []
    let patch: Record<string, unknown> | null = null
    const api = {
      select: () => api,
      update: (values: Record<string, unknown>) => {
        patch = values
        return api
      },
      eq: (column: string, value: unknown) => {
        filters.push({ op: 'eq', column, value })
        return api
      },
      neq: (column: string, value: unknown) => {
        filters.push({ op: 'neq', column, value })
        return api
      },
      maybeSingle: async () => ({ data: matches(filters) ? { ...row } : null }),
      then: (resolve: (value: { data: { id: string }[] }) => unknown) => {
        if (patch && matches(filters)) {
          Object.assign(row, patch)
          return resolve({ data: [{ id: row.id }] })
        }
        return resolve({ data: [] })
      },
    }
    return api
  }
  return { from: () => builder() } as unknown as Parameters<typeof settleIyzicoOrder>[0]
}

const creds: IyzicoCredentials = { apiKey: 'k', secretKey: 's', environment: 'sandbox' }

function setup(overrides: Partial<Row> = {}) {
  const row: Row = {
    id: 'o1',
    project_id: 'proj-a',
    payment_ref: 'tok-1',
    payment_provider: 'iyzico',
    payment_status: 'pending',
    status: 'pending',
    total_cents: 5000,
    currency: 'TRY',
    payment_nonce: 'nonce',
    ...overrides,
  }
  const deps = {
    finalizePaidStock: vi.fn(async () => ({ oversold: false })),
    releaseOrderStock: vi.fn(async () => undefined),
    notifyOrder: vi.fn(),
  } satisfies StoreWebhookDeps
  const order = (): SettleOrder => ({
    id: row.id,
    project_id: row.project_id,
    payment_status: row.payment_status,
    payment_ref: row.payment_ref,
    total_cents: row.total_cents,
    currency: row.currency,
  })
  return { row, deps, admin: fakeAdmin(row), order }
}

const retrieveOk = (over: Record<string, unknown> = {}) =>
  (async () =>
    new Response(
      JSON.stringify({
        status: 'success',
        paymentStatus: 'SUCCESS',
        conversationId: 'o1',
        basketId: 'o1',
        paymentId: 'pay-77',
        currency: 'TRY',
        price: 50,
        paidPrice: 50,
        ...over,
      }),
      { status: 200 },
    )) as unknown as typeof fetch

describe('settleIyzicoOrder', () => {
  it('a valid retrieve marks the order paid exactly once', async () => {
    const { row, deps, admin, order } = setup()
    const outcome = await settleIyzicoOrder(admin, creds, order(), { fetchImpl: retrieveOk(), deps })
    expect(outcome).toBe('paid')
    expect(row.payment_status).toBe('paid')
    expect(row.provider_payment_id).toBe('pay-77')
    expect(row.payment_nonce).toBeNull()
    expect(deps.finalizePaidStock).toHaveBeenCalledTimes(1)
    expect(deps.notifyOrder).toHaveBeenCalledTimes(1)
  })

  it('a repeated call takes no second stock and sends no second email', async () => {
    const { deps, admin, order } = setup()
    await settleIyzicoOrder(admin, creds, order(), { fetchImpl: retrieveOk(), deps })
    const again = await settleIyzicoOrder(admin, creds, order(), { fetchImpl: retrieveOk(), deps })
    expect(again).toBe('paid')
    expect(deps.finalizePaidStock).toHaveBeenCalledTimes(1)
    expect(deps.notifyOrder).toHaveBeenCalledTimes(1)
  })

  it('a stale concurrent call that still sees pending is a duplicate, not a second fulfilment', async () => {
    const { deps, admin, order } = setup()
    const stale = order()
    await settleIyzicoOrder(admin, creds, order(), { fetchImpl: retrieveOk(), deps })
    const outcome = await settleIyzicoOrder(admin, creds, stale, { fetchImpl: retrieveOk(), deps })
    expect(outcome).toBe('paid')
    expect(deps.finalizePaidStock).toHaveBeenCalledTimes(1)
    expect(deps.notifyOrder).toHaveBeenCalledTimes(1)
  })

  it('rejects a paidPrice below the order total', async () => {
    const { row, deps, admin, order } = setup()
    const outcome = await settleIyzicoOrder(admin, creds, order(), {
      fetchImpl: retrieveOk({ paidPrice: 10 }),
      deps,
    })
    expect(outcome).toBe('mismatch')
    expect(row.payment_status).toBe('pending')
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
    expect(deps.notifyOrder).not.toHaveBeenCalled()
  })

  it('rejects a retrieve answer that belongs to another order', async () => {
    const { row, deps, admin, order } = setup()
    const outcome = await settleIyzicoOrder(admin, creds, order(), {
      fetchImpl: retrieveOk({ conversationId: 'other-order', basketId: 'other-order' }),
      deps,
    })
    expect(outcome).toBe('mismatch')
    expect(row.payment_status).toBe('pending')
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
  })

  it("never settles another store's order, even with a valid-looking payment", async () => {
    const { row, deps, admin, order } = setup()
    const foreign = { ...order(), project_id: 'proj-b' }
    const outcome = await settleIyzicoOrder(admin, creds, foreign, { fetchImpl: retrieveOk(), deps })
    expect(outcome).not.toBe('paid')
    expect(row.payment_status).toBe('pending')
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
    expect(deps.notifyOrder).not.toHaveBeenCalled()
  })

  it('a failed payment fails the order and releases stock', async () => {
    const { row, deps, admin, order } = setup()
    const outcome = await settleIyzicoOrder(admin, creds, order(), {
      fetchImpl: retrieveOk({ paymentStatus: 'FAILURE' }),
      deps,
    })
    expect(outcome).toBe('failed')
    expect(row.payment_status).toBe('failed')
    expect(deps.releaseOrderStock).toHaveBeenCalledTimes(1)
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
    expect(deps.notifyOrder).not.toHaveBeenCalled()
  })

  it('a retrieve network error leaves the order pending and keeps its stock', async () => {
    const { row, deps, admin, order } = setup()
    const outcome = await settleIyzicoOrder(admin, creds, order(), {
      fetchImpl: (async () => Promise.reject(new Error('network'))) as typeof fetch,
      deps,
    })
    expect(outcome).toBe('unavailable')
    expect(row.payment_status).toBe('pending')
    expect(row.status).toBe('pending')
    expect(deps.releaseOrderStock).not.toHaveBeenCalled()
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
  })

  it('an order without a stored token cannot be settled', async () => {
    const { deps, admin, order } = setup()
    const outcome = await settleIyzicoOrder(admin, creds, { ...order(), payment_ref: null }, { fetchImpl: retrieveOk(), deps })
    expect(outcome).toBe('no_token')
  })
})
