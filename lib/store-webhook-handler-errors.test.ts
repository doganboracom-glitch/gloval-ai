import { describe, expect, it, vi } from 'vitest'
import { applyStorePaymentWebhook, type StoreWebhookDeps } from '@/lib/store-webhook-handler'
import { createQueryFake, type QueryCall, type QueryResult } from '@/lib/test-support/query-fake'

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  payment_status: 'pending',
  status: 'pending',
  total_cents: 5000,
  currency: 'TRY',
  ...over,
})

const paid = { reference: 'ref-1', status: 'paid' as const, paidAmountCents: 5000, paidCurrency: 'TRY' }
const failed = { reference: 'ref-1', status: 'failed' as const }
const refunded = { reference: 'ref-1', status: 'refunded' as const }

function setup(
  override: (call: QueryCall) => QueryResult | undefined,
  orderOver: Record<string, unknown> = {},
) {
  const fake = createQueryFake((call) => {
    const custom = override(call)
    if (custom) return custom
    if (call.op === 'select') return { data: order(orderOver) }
    return { data: [{ id: 'o1' }] }
  })
  const deps = {
    finalizePaidStock: vi.fn<StoreWebhookDeps['finalizePaidStock']>(async () => ({ oversold: false })),
    releaseOrderStock: vi.fn<StoreWebhookDeps['releaseOrderStock']>(async () => undefined),
    notifyOrder: vi.fn(),
  } satisfies StoreWebhookDeps
  return { ...fake, deps }
}

describe('applyStorePaymentWebhook database errors', () => {
  it('answers a retryable error when the order lookup fails, never "not found"', async () => {
    const { client, deps } = setup((c) => (c.op === 'select' ? { error: { code: '57014' } } : undefined))
    const res = await applyStorePaymentWebhook(client, 'iyzico', paid, deps)
    expect(res).toEqual({ outcome: 'error', step: 'lookup' })
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
    expect(deps.notifyOrder).not.toHaveBeenCalled()
  })

  it('leaves the order pending and does nothing else when marking paid fails', async () => {
    const { client, deps, calls } = setup((c) => (c.op === 'update' ? { error: { code: '40001' } } : undefined))
    const res = await applyStorePaymentWebhook(client, 'iyzico', paid, deps)
    expect(res).toEqual({ outcome: 'error', step: 'mark_paid' })
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
    expect(deps.notifyOrder).not.toHaveBeenCalled()
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(1)
  })

  it('reverts to the previous state and sends no email when stock cannot be taken', async () => {
    const { client, deps, calls } = setup(() => undefined)
    deps.finalizePaidStock.mockResolvedValueOnce({ oversold: false, stockFailed: true })
    const res = await applyStorePaymentWebhook(client, 'iyzico', paid, deps)
    expect(res).toEqual({ outcome: 'error', step: 'take_stock' })
    expect(deps.notifyOrder).not.toHaveBeenCalled()
    const updates = calls.filter((c) => c.op === 'update')
    expect(updates).toHaveLength(2)
    expect(updates[1].values).toEqual({ payment_status: 'pending', status: 'pending' })
    expect(updates[1].filters).toContainEqual({ op: 'eq', column: 'payment_status', value: 'paid' })
  })

  it('treats a throwing stock step like a failed one', async () => {
    const { client, deps } = setup(() => undefined)
    deps.finalizePaidStock.mockRejectedValueOnce(new Error('boom'))
    const res = await applyStorePaymentWebhook(client, 'iyzico', paid, deps)
    expect(res).toEqual({ outcome: 'error', step: 'take_stock' })
    expect(deps.notifyOrder).not.toHaveBeenCalled()
  })

  it('still reports the retryable error when the revert itself fails', async () => {
    let updates = 0
    const { client, deps } = setup((c) => {
      if (c.op !== 'update') return undefined
      updates += 1
      return updates === 1 ? { data: [{ id: 'o1' }] } : { error: { code: '08006' } }
    })
    deps.finalizePaidStock.mockResolvedValueOnce({ oversold: false, stockFailed: true })
    const res = await applyStorePaymentWebhook(client, 'iyzico', paid, deps)
    expect(res).toEqual({ outcome: 'error', step: 'take_stock' })
  })

  it('an oversold payment is still fulfilled and reported', async () => {
    const { client, deps } = setup(() => undefined)
    deps.finalizePaidStock.mockResolvedValueOnce({ oversold: true })
    const res = await applyStorePaymentWebhook(client, 'iyzico', paid, deps)
    expect(res).toEqual({ outcome: 'paid', oversold: true })
    expect(deps.notifyOrder).toHaveBeenCalledTimes(1)
  })

  it('does not release stock when marking failed errors', async () => {
    const { client, deps } = setup((c) => (c.op === 'update' ? { error: { code: '40001' } } : undefined))
    const res = await applyStorePaymentWebhook(client, 'iyzico', failed, deps)
    expect(res).toEqual({ outcome: 'error', step: 'mark_failed' })
    expect(deps.releaseOrderStock).not.toHaveBeenCalled()
  })

  it('reports a retryable error when the stock release throws after failing the order', async () => {
    const { client, deps } = setup(() => undefined)
    deps.releaseOrderStock.mockRejectedValueOnce(new Error('stock_release_failed:57014'))
    const res = await applyStorePaymentWebhook(client, 'iyzico', failed, deps)
    expect(res).toEqual({ outcome: 'error', step: 'release_stock' })
  })

  it('reports a retryable error when marking refunded fails', async () => {
    const { client, deps } = setup((c) => (c.op === 'update' ? { error: { code: '40001' } } : undefined), {
      payment_status: 'paid',
      status: 'paid',
    })
    const res = await applyStorePaymentWebhook(client, 'iyzico', refunded, deps)
    expect(res).toEqual({ outcome: 'error', step: 'mark_refunded' })
  })

  it('scopes the lookup to the store when a project is given', async () => {
    const { client, deps, calls } = setup(() => undefined)
    await applyStorePaymentWebhook(client, 'iyzico', paid, deps, { projectId: 'p1' })
    expect(calls[0].filters).toContainEqual({ op: 'eq', column: 'project_id', value: 'p1' })
  })
})
