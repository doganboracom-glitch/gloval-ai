import { describe, expect, it, vi } from 'vitest'
import { applyStorePaymentWebhook, type StoreWebhookDeps } from '@/lib/store-webhook-handler'

type OrderRow = {
  id: string
  payment_ref: string
  payment_provider: string
  payment_status: string
  status: string
  total_cents: number
  currency: string
}

type Filter = { op: 'eq' | 'neq'; column: string; value: unknown }

/** Minimal in-memory stand-in for the Supabase query builder used by the handler. */
function fakeAdmin(row: OrderRow) {
  const matches = (filters: Filter[]) =>
    filters.every((f) =>
      f.op === 'eq'
        ? (row as Record<string, unknown>)[f.column] === f.value
        : (row as Record<string, unknown>)[f.column] !== f.value,
    )

  function builder() {
    const filters: Filter[] = []
    let patch: Partial<OrderRow> | null = null
    const api = {
      select: () => api,
      update: (values: Partial<OrderRow>) => {
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
        // A conditional UPDATE only changes the row when every filter matches.
        if (patch && matches(filters)) {
          Object.assign(row, patch)
          return resolve({ data: [{ id: row.id }] })
        }
        return resolve({ data: [] })
      },
    }
    return api
  }

  return { from: () => builder() } as unknown as Parameters<typeof applyStorePaymentWebhook>[0]
}

function setup(overrides: Partial<OrderRow> = {}) {
  const row: OrderRow = {
    id: 'o1',
    payment_ref: 'ref-1',
    payment_provider: 'iyzico',
    payment_status: 'pending',
    status: 'pending',
    total_cents: 5000,
    currency: 'TRY',
    ...overrides,
  }
  const deps = {
    finalizePaidStock: vi.fn(async () => ({ oversold: false })),
    releaseOrderStock: vi.fn(async () => undefined),
    notifyOrder: vi.fn(),
  } satisfies StoreWebhookDeps
  return { row, deps, admin: fakeAdmin(row) }
}

const paid = { reference: 'ref-1', status: 'paid' as const, paidAmountCents: 5000, paidCurrency: 'TRY' }

describe('applyStorePaymentWebhook', () => {
  it('settles a matching payment once and triggers stock + email', async () => {
    const { row, deps, admin } = setup()
    const res = await applyStorePaymentWebhook(admin, 'iyzico', paid, deps)
    expect(res).toEqual({ outcome: 'paid', oversold: false })
    expect(row.payment_status).toBe('paid')
    expect(deps.finalizePaidStock).toHaveBeenCalledTimes(1)
    expect(deps.notifyOrder).toHaveBeenCalledTimes(1)
  })

  it('a repeated delivery takes no stock and sends no second email', async () => {
    const { deps, admin } = setup()
    await applyStorePaymentWebhook(admin, 'iyzico', paid, deps)
    const second = await applyStorePaymentWebhook(admin, 'iyzico', paid, deps)
    expect(second).toEqual({ outcome: 'duplicate' })
    expect(deps.finalizePaidStock).toHaveBeenCalledTimes(1)
    expect(deps.notifyOrder).toHaveBeenCalledTimes(1)
  })

  it('rejects an amount mismatch without touching the order', async () => {
    const { row, deps, admin } = setup()
    const res = await applyStorePaymentWebhook(admin, 'iyzico', { ...paid, paidAmountCents: 100 }, deps)
    expect(res).toEqual({ outcome: 'rejected', reason: 'amount_mismatch' })
    expect(row.payment_status).toBe('pending')
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
    expect(deps.notifyOrder).not.toHaveBeenCalled()
  })

  it('rejects a currency mismatch', async () => {
    const { deps, admin } = setup()
    const res = await applyStorePaymentWebhook(admin, 'iyzico', { ...paid, paidCurrency: 'USD' }, deps)
    expect(res).toEqual({ outcome: 'rejected', reason: 'currency_mismatch' })
  })

  it('rejects a paid callback that reports no amount', async () => {
    const { deps, admin } = setup()
    const res = await applyStorePaymentWebhook(
      admin,
      'iyzico',
      { reference: 'ref-1', status: 'paid' },
      deps,
    )
    expect(res).toEqual({ outcome: 'rejected', reason: 'amount_missing' })
  })

  it('does not find an order through a different provider', async () => {
    const { deps, admin } = setup()
    const res = await applyStorePaymentWebhook(admin, 'stripe', paid, deps)
    expect(res).toEqual({ outcome: 'order_not_found' })
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
  })

  it('a late failed callback cannot overwrite a paid order', async () => {
    const { row, deps, admin } = setup({ payment_status: 'paid', status: 'paid' })
    const res = await applyStorePaymentWebhook(
      admin,
      'iyzico',
      { reference: 'ref-1', status: 'failed' },
      deps,
    )
    expect(res).toEqual({ outcome: 'ignored', reason: 'already_paid' })
    expect(row.payment_status).toBe('paid')
    expect(deps.releaseOrderStock).not.toHaveBeenCalled()
  })

  it('a failed callback releases stock exactly once', async () => {
    const { deps, admin } = setup()
    const failed = { reference: 'ref-1', status: 'failed' as const }
    expect(await applyStorePaymentWebhook(admin, 'iyzico', failed, deps)).toEqual({ outcome: 'failed' })
    expect(await applyStorePaymentWebhook(admin, 'iyzico', failed, deps)).toEqual({ outcome: 'duplicate' })
    expect(deps.releaseOrderStock).toHaveBeenCalledTimes(1)
    expect(deps.releaseOrderStock).toHaveBeenCalledWith(expect.anything(), 'o1', { onlyUnpaid: true })
  })

  it('never leaves refunded', async () => {
    const { row, deps, admin } = setup({ payment_status: 'refunded', status: 'refunded' })
    const res = await applyStorePaymentWebhook(admin, 'iyzico', paid, deps)
    expect(res).toEqual({ outcome: 'ignored', reason: 'already_refunded' })
    expect(row.payment_status).toBe('refunded')
  })

  it('only refunds an order that was paid', async () => {
    const { deps, admin } = setup()
    const res = await applyStorePaymentWebhook(
      admin,
      'iyzico',
      { reference: 'ref-1', status: 'refunded' },
      deps,
    )
    expect(res).toEqual({ outcome: 'ignored', reason: 'not_paid' })
  })

  it('reports an oversold order but still marks it paid', async () => {
    const { row, deps, admin } = setup()
    deps.finalizePaidStock.mockResolvedValueOnce({ oversold: true })
    const res = await applyStorePaymentWebhook(admin, 'iyzico', paid, deps)
    expect(res).toEqual({ outcome: 'paid', oversold: true })
    expect(row.payment_status).toBe('paid')
  })
})
