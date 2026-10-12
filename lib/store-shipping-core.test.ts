import { describe, expect, it } from 'vitest'
import { markOrderDelivered, markOrderUndelivered, orderNotificationDedupeKey, shipOrder, type ShippingOrderRow, type ShippingOrderStore } from './store-shipping-core'

function store(row: Partial<ShippingOrderRow> = {}, updateResult: 'moved' | 'lost' | 'error' = 'moved') {
  const order: ShippingOrderRow = {
    id: 'o1', project_id: 'shop-a', status: 'processing', payment_status: 'paid',
    payment_provider: 'paytr', shipping_status: 'preparing', shipped_at: null, ...row,
  }
  const updates: Record<string, unknown>[] = []
  const db: ShippingOrderStore = {
    async find(projectId, orderId) { return projectId === order.project_id && orderId === order.id ? order : null },
    async update(projectId, orderId, patch) {
      if (projectId !== order.project_id || orderId !== order.id) return 'lost'
      updates.push(patch)
      return updateResult
    },
  }
  return { db, updates }
}

const valid = { carrier: 'ups', trackingNumber: 'AB-123456' }

describe('shipOrder', () => {
  it.each([
    [{ payment_status: 'pending', payment_provider: 'bank_transfer' }, 'payment_pending'],
    [{ payment_status: 'failed', payment_provider: 'paytr' }, 'payment_pending'],
    [{ status: 'cancelled' }, 'cancelled'],
    [{ status: 'failed' }, 'cancelled'],
  ] as const)('rejects unsafe order %j', async (row, error) => {
    const { db } = store(row)
    expect(await shipOrder(db, { projectId: 'shop-a', orderId: 'o1', ...valid })).toEqual({ ok: false, error })
  })

  it.each([
    [{ payment_status: 'pending', payment_provider: 'cash_on_delivery' }],
    [{ payment_status: 'paid', payment_provider: 'paytr' }],
  ] as const)('ships allowed order %j', async (row) => {
    const { db, updates } = store(row)
    expect(await shipOrder(db, { projectId: 'shop-a', orderId: 'o1', ...valid }, () => '2026-01-01T00:00:00.000Z')).toMatchObject({ ok: true, kind: 'shipped', notify: true })
    expect(updates[0]).toMatchObject({ shipping_status: 'shipped', tracking_number: 'AB-123456' })
  })

  it('rejects another store order and invalid tracking values', async () => {
    const { db } = store()
    expect(await shipOrder(db, { projectId: 'shop-b', orderId: 'o1', ...valid })).toEqual({ ok: false, error: 'not_found' })
    expect(await shipOrder(db, { projectId: 'shop-a', orderId: 'o1', carrier: 'ups', trackingNumber: 'bad!' })).toEqual({ ok: false, error: 'invalid_tracking' })
  })

  it('does not duplicate the transition after a race', async () => {
    const { db } = store({}, 'lost')
    expect(await shipOrder(db, { projectId: 'shop-a', orderId: 'o1', ...valid })).toEqual({ ok: false, error: 'conflict' })
  })

  it('covers preparing to shipped to delivered and back to shipped to delivered', async () => {
    const first = store()
    expect(await shipOrder(first.db, { projectId: 'shop-a', orderId: 'o1', ...valid })).toMatchObject({ ok: true, kind: 'shipped' })
    const second = store({ shipping_status: 'shipped', shipped_at: '2026-01-01T00:00:00.000Z' })
    expect(await markOrderDelivered(second.db, { projectId: 'shop-a', orderId: 'o1' })).toEqual({ ok: true })
    const third = store({ shipping_status: 'delivered', shipped_at: '2026-01-01T00:00:00.000Z' })
    await expect(markOrderUndelivered(third.db, { projectId: 'shop-a', orderId: 'o1' })).resolves.toEqual({ ok: true })
    expect(third.updates[0]).toMatchObject({ shipping_status: 'shipped', status: 'shipped', delivered_at: null })
    const fourth = store({ shipping_status: 'shipped', shipped_at: '2026-01-01T00:00:00.000Z' })
    expect(await markOrderDelivered(fourth.db, { projectId: 'shop-a', orderId: 'o1' })).toEqual({ ok: true })
  })

  it('uses one stable delivered-email key across retries and separates shipped mail', () => {
    expect(orderNotificationDedupeKey('o1', 'buyer-delivered')).toBe('store-order:o1:delivered')
    expect(orderNotificationDedupeKey('o1', 'buyer-delivered')).toBe(orderNotificationDedupeKey('o1', 'buyer-delivered'))
    expect(orderNotificationDedupeKey('o1', 'buyer-shipped')).toBe('store-order:o1:shipped')
  })

  it('delivers only shipped orders and is idempotence-safe', async () => {
    const { db } = store({ shipping_status: 'shipped' })
    expect(await markOrderDelivered(db, { projectId: 'shop-a', orderId: 'o1' }, () => '2026-01-02T00:00:00.000Z')).toEqual({ ok: true })
    const { db: delivered } = store({ shipping_status: 'delivered' })
    expect(await markOrderDelivered(delivered, { projectId: 'shop-a', orderId: 'o1' })).toEqual({ ok: false, error: 'already_delivered' })
  })
})
