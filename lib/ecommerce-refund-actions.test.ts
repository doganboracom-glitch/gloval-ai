import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireOwnedEcommerceProject: vi.fn(),
  requireUser: vi.fn(),
  loadIyzicoCredentials: vi.fn(),
  refundIyzicoOrder: vi.fn(),
  confirmManualPayment: vi.fn(),
  cancelManualOrder: vi.fn(),
  finalizePaidStock: vi.fn(),
  releaseOrderStock: vi.fn(),
  orderRow: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/store-revalidate', () => ({ revalidateStorefront: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/ecommerce-access', () => ({
  requireOwnedEcommerceProject: mocks.requireOwnedEcommerceProject,
  requireUser: mocks.requireUser,
  requireEcommerceMode: vi.fn(),
  requireCatalogCapablePlan: vi.fn(),
}))
vi.mock('@/lib/product-image-service', () => ({
  discardProjectImageUrls: vi.fn(),
  removeUnreferencedProjectImages: vi.fn(),
}))
vi.mock('@/lib/product-image-store', () => ({
  createProductImageCleanupDeps: vi.fn(),
  getProductImageStorageBase: vi.fn(),
}))
vi.mock('@/lib/projects', () => ({ createProject: vi.fn() }))
vi.mock('@/lib/billing', () => ({ getMyCurrentPlan: vi.fn() }))
vi.mock('@/lib/effective-limits', () => ({ getEffectiveProductLimit: vi.fn() }))
vi.mock('@/lib/store-order-stock', () => ({
  finalizePaidStock: mocks.finalizePaidStock,
  releaseOrderStock: mocks.releaseOrderStock,
}))
vi.mock('@/lib/store-manual-orders', () => ({
  cancelManualOrder: mocks.cancelManualOrder,
  confirmManualPayment: mocks.confirmManualPayment,
  defaultManualOrderDeps: vi.fn(() => ({})),
}))
vi.mock('@/lib/store-order-notifications', () => ({ scheduleOrderNotification: vi.fn() }))
vi.mock('@/lib/store-payments/iyzico-credentials', () => ({ loadIyzicoCredentials: mocks.loadIyzicoCredentials }))
vi.mock('@/lib/store-payments/iyzico-refund', () => ({ refundIyzicoOrder: mocks.refundIyzicoOrder }))
vi.mock('@/lib/store-payments/iyzico-refund-deps', () => ({ realRefundDeps: {} }))

import { refundCardOrder, updateOrderStatus } from '@/lib/ecommerce'

function supabaseForOrder() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: mocks.orderRow, error: null }),
    update: (values: Record<string, unknown>) => {
      mocks.updates.push(values)
      return { eq: () => ({ eq: async () => ({ error: null }) }) }
    },
  }
  return { from: () => chain }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates = []
  mocks.orderRow = { payment_provider: 'iyzico', payment_status: 'paid' }
  mocks.requireOwnedEcommerceProject.mockResolvedValue({ supabase: supabaseForOrder() })
  mocks.requireUser.mockResolvedValue({ userId: 'owner-1' })
  mocks.loadIyzicoCredentials.mockResolvedValue({ ok: true, creds: { apiKey: 'k', secretKey: 's', environment: 'sandbox' } })
  mocks.refundIyzicoOrder.mockResolvedValue({ ok: true, already: false, method: 'cancel', followUp: 'done' })
  mocks.confirmManualPayment.mockResolvedValue({ outcome: 'confirmed', oversold: false })
  mocks.cancelManualOrder.mockResolvedValue({ outcome: 'cancelled' })
})

describe('7. another store\'s order through the owner action', () => {
  it('stops at the ownership check: no credentials are loaded and iyzico is never reached', async () => {
    mocks.requireOwnedEcommerceProject.mockRejectedValue(new Error('NOT_FOUND'))
    await expect(refundCardOrder('someone-elses-project', 'o1')).rejects.toThrow('NOT_FOUND')
    expect(mocks.loadIyzicoCredentials).not.toHaveBeenCalled()
    expect(mocks.refundIyzicoOrder).not.toHaveBeenCalled()
  })

  it('updateOrderStatus is stopped by the same check', async () => {
    mocks.requireOwnedEcommerceProject.mockRejectedValue(new Error('NOT_FOUND'))
    await expect(updateOrderStatus('someone-elses-project', 'o1', 'cancelled')).rejects.toThrow('NOT_FOUND')
    expect(mocks.refundIyzicoOrder).not.toHaveBeenCalled()
  })

  it('passes the owner\'s own project id down to the refund so the order lookup is scoped', async () => {
    await refundCardOrder('p1', 'o1')
    expect(mocks.refundIyzicoOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ apiKey: 'k' }),
      { projectId: 'p1', orderId: 'o1' },
      expect.anything(),
    )
  })
})

describe('refundCardOrder', () => {
  it('maps a refusal to a fixed Turkish message without any raw text', async () => {
    mocks.refundIyzicoOrder.mockResolvedValue({ ok: false, error: 'rejected', rejectionCode: '10237' })
    const res = await refundCardOrder('p1', 'o1')
    expect(res).toMatchObject({ ok: false, error: 'rejected' })
    expect(res.ok ? '' : res.message).toContain('İade başarısız')
    expect(res.ok ? '' : res.message).toContain('iyzico destek')
  })

  it('reports unreadable keys without calling iyzico', async () => {
    mocks.loadIyzicoCredentials.mockResolvedValue({ ok: false })
    const res = await refundCardOrder('p1', 'o1')
    expect(res).toMatchObject({ ok: false, error: 'credentials' })
    expect(mocks.refundIyzicoOrder).not.toHaveBeenCalled()
  })
})

describe('8. updateOrderStatus on a paid card order', () => {
  it.each(['failed', 'pending'] as const)('refuses to move it to "%s" and changes nothing', async (status) => {
    await expect(updateOrderStatus('p1', 'o1', status)).rejects.toThrow('PAYMENT_PAID')
    expect(mocks.updates).toHaveLength(0)
    expect(mocks.refundIyzicoOrder).not.toHaveBeenCalled()
    expect(mocks.releaseOrderStock).not.toHaveBeenCalled()
  })

  it.each(['cancelled', 'refunded'] as const)('"%s" really reverses the payment at iyzico, with no bare status write', async (status) => {
    await updateOrderStatus('p1', 'o1', status)
    expect(mocks.refundIyzicoOrder).toHaveBeenCalledTimes(1)
    expect(mocks.updates).toHaveLength(0)
  })

  it('surfaces a refused refund as an error and writes nothing', async () => {
    mocks.refundIyzicoOrder.mockResolvedValue({ ok: false, error: 'unavailable' })
    await expect(updateOrderStatus('p1', 'o1', 'cancelled')).rejects.toThrow('İade başarısız')
    expect(mocks.updates).toHaveLength(0)
  })

  it('fulfilment statuses still work on a paid card order', async () => {
    await updateOrderStatus('p1', 'o1', 'shipped')
    expect(mocks.updates).toEqual([{ status: 'shipped' }])
    expect(mocks.refundIyzicoOrder).not.toHaveBeenCalled()
  })
})

describe('6. bank transfer and cash on delivery keep their own flow', () => {
  it('a pending bank transfer is cancelled through the manual flow, not iyzico', async () => {
    mocks.orderRow = { payment_provider: 'bank_transfer', payment_status: 'pending' }
    await updateOrderStatus('p1', 'o1', 'cancelled')
    expect(mocks.cancelManualOrder).toHaveBeenCalledTimes(1)
    expect(mocks.refundIyzicoOrder).not.toHaveBeenCalled()
    expect(mocks.loadIyzicoCredentials).not.toHaveBeenCalled()
  })

  it('a pending cash-on-delivery order is confirmed through the manual flow', async () => {
    mocks.orderRow = { payment_provider: 'cash_on_delivery', payment_status: 'pending' }
    await updateOrderStatus('p1', 'o1', 'paid')
    expect(mocks.confirmManualPayment).toHaveBeenCalledTimes(1)
    expect(mocks.refundIyzicoOrder).not.toHaveBeenCalled()
  })

  it('a paid bank-transfer order is never routed to iyzico, even for "failed"', async () => {
    mocks.orderRow = { payment_provider: 'bank_transfer', payment_status: 'paid' }
    await updateOrderStatus('p1', 'o1', 'failed')
    expect(mocks.refundIyzicoOrder).not.toHaveBeenCalled()
    expect(mocks.updates).toEqual([{ status: 'failed' }])
  })
})
