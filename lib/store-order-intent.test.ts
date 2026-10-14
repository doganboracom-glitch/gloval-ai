import { describe, expect, it, vi } from 'vitest'
import { persistPaymentIntent, voidOrder, type PersistIntentDeps } from '@/lib/store-order-intent'
import { createQueryFake, type QueryCall, type QueryResult } from '@/lib/test-support/query-fake'

function setup(respond: (call: QueryCall) => QueryResult | undefined = () => undefined) {
  const fake = createQueryFake((call) => respond(call) ?? { data: null })
  const deps = {
    finalizePaidStock: vi.fn(async () => ({ oversold: false })),
    releaseOrderStockSafely: vi.fn(async () => true),
  } satisfies PersistIntentDeps
  return { ...fake, deps }
}

const pending = { action: 'redirect', status: 'pending', reference: 'ref-9' }
const input = { orderId: 'o1', idempotencyKey: 'key-1' }

describe('persistPaymentIntent', () => {
  it('stores the payment reference and status', async () => {
    const { client, deps, calls } = setup()
    const res = await persistPaymentIntent(client, { ...input, intent: pending }, deps)
    expect(res).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
    expect(calls[0].values).toEqual({ payment_ref: 'ref-9', payment_status: 'pending' })
    expect(deps.releaseOrderStockSafely).not.toHaveBeenCalled()
  })

  it('releases stock and voids the order when the reference cannot be saved', async () => {
    const { client, deps, calls } = setup((c) =>
      c.op === 'update' && 'payment_ref' in (c.values as object) ? { error: { code: '40001' } } : undefined,
    )
    const res = await persistPaymentIntent(client, { ...input, intent: pending }, deps)
    expect(res).toEqual({ ok: false, error: 'order_failed' })
    expect(deps.releaseOrderStockSafely).toHaveBeenCalledWith(client, 'o1')
    const voided = calls.find((c) => (c.values as { status?: string })?.status === 'cancelled')
    expect(voided?.values).toMatchObject({
      status: 'cancelled',
      payment_status: 'failed',
      idempotency_key: 'key-1#void-o1',
    })
  })

  it('marks a synchronous payment paid and takes its stock', async () => {
    const { client, deps, calls } = setup()
    const res = await persistPaymentIntent(
      client,
      { ...input, intent: { action: 'completed', status: 'paid', reference: 'mock-1' } },
      deps,
    )
    expect(res).toEqual({ ok: true })
    expect(calls[0].values).toEqual({ status: 'paid', payment_status: 'paid', payment_ref: 'mock-1' })
    expect(deps.finalizePaidStock).toHaveBeenCalledWith(client, 'o1')
  })

  it('voids the order and takes no stock when marking a synchronous payment paid fails', async () => {
    const { client, deps } = setup((c) =>
      c.op === 'update' && (c.values as { status?: string }).status === 'paid'
        ? { error: { code: '40001' } }
        : undefined,
    )
    const res = await persistPaymentIntent(
      client,
      { ...input, intent: { action: 'completed', status: 'paid', reference: 'mock-1' } },
      deps,
    )
    expect(res).toEqual({ ok: false, error: 'order_failed' })
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
    expect(deps.releaseOrderStockSafely).toHaveBeenCalledTimes(1)
  })
})

describe('voidOrder', () => {
  it('does not throw when the void itself cannot be saved', async () => {
    const { client } = setup(() => ({ error: { code: '08006' } }))
    await expect(voidOrder(client, 'o1', 'key-1')).resolves.toBeUndefined()
  })
})
