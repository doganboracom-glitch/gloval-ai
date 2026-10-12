import { isCarrierId, normalizeTrackingNumber, type CarrierId } from '@/lib/shipping-carriers'
import { shipGate } from '@/lib/store-shipping-rules'

/**
 * Shipping lifecycle of an order, kept free of any database client so it can be
 * tested with an in-memory store:
 *
 *   preparing --ship--> shipped --deliver--> delivered
 *
 * Shipping and delivering are conditional updates on `shipping_status`, so a
 * double click or two browser tabs move an order at most once and only the
 * winner sends the e-mail. Correcting the carrier/code of an already shipped
 * order never moves the status back.
 */

export type ShippingOrderRow = {
  id: string
  project_id: string
  status: string
  payment_status: string
  payment_provider: string | null
  shipping_status: string | null
  shipped_at: string | null
}

export type UpdateResult = 'moved' | 'lost' | 'error'

export interface ShippingOrderStore {
  find(projectId: string, orderId: string): Promise<ShippingOrderRow | null>
  /**
   * Applies `patch` only while the order is not cancelled/failed/refunded and,
   * when `whenShippingStatus` is given, only while it is one of those values.
   */
  update(
    projectId: string,
    orderId: string,
    patch: Record<string, unknown>,
    whenShippingStatus?: string[],
  ): Promise<UpdateResult>
}

export type ShipInput = {
  carrier: unknown
  trackingNumber: unknown
  /** Correction of an already shipped order: also e-mail the buyer again. */
  renotify?: boolean
}

export type ShipOutcome =
  | { ok: true; kind: 'shipped' | 'corrected'; notify: boolean }
  | {
      ok: false
      error:
        | 'not_found'
        | 'invalid_carrier'
        | 'invalid_tracking'
        | 'payment_pending'
        | 'cancelled'
        | 'conflict'
        | 'failed'
    }

export async function shipOrder(
  store: ShippingOrderStore,
  input: { projectId: string; orderId: string } & ShipInput,
  now: () => string = () => new Date().toISOString(),
): Promise<ShipOutcome> {
  if (!isCarrierId(input.carrier)) return { ok: false, error: 'invalid_carrier' }
  const trackingNumber = normalizeTrackingNumber(input.trackingNumber)
  if (!trackingNumber) return { ok: false, error: 'invalid_tracking' }
  const carrier: CarrierId = input.carrier

  const order = await store.find(input.projectId, input.orderId)
  if (!order) return { ok: false, error: 'not_found' }

  const gate = shipGate(order)
  if (gate !== 'ok') return { ok: false, error: gate }

  const alreadyShipped = order.shipped_at !== null || order.shipping_status !== 'preparing'
  const info = { tracking_carrier: carrier, tracking_number: trackingNumber }

  if (alreadyShipped) {
    const result = await store.update(input.projectId, input.orderId, info)
    if (result === 'error') return { ok: false, error: 'failed' }
    if (result === 'lost') return { ok: false, error: 'cancelled' }
    return { ok: true, kind: 'corrected', notify: Boolean(input.renotify) }
  }

  const result = await store.update(
    input.projectId,
    input.orderId,
    { ...info, shipping_status: 'shipped', status: 'shipped', shipped_at: now() },
    ['preparing'],
  )
  if (result === 'error') return { ok: false, error: 'failed' }
  if (result === 'lost') return { ok: false, error: 'conflict' }
  return { ok: true, kind: 'shipped', notify: true }
}

export type DeliverOutcome =
  | { ok: true }
  | {
      ok: false
      error: 'not_found' | 'not_shipped' | 'already_delivered' | 'cancelled' | 'conflict' | 'failed'
    }

export async function markOrderDelivered(
  store: ShippingOrderStore,
  input: { projectId: string; orderId: string },
  now: () => string = () => new Date().toISOString(),
): Promise<DeliverOutcome> {
  const order = await store.find(input.projectId, input.orderId)
  if (!order) return { ok: false, error: 'not_found' }
  if (['cancelled', 'failed', 'refunded'].includes(order.status)) {
    return { ok: false, error: 'cancelled' }
  }
  if (order.shipping_status === 'delivered') return { ok: false, error: 'already_delivered' }
  if (order.shipping_status !== 'shipped' && order.shipping_status !== 'in_transit') {
    return { ok: false, error: 'not_shipped' }
  }

  const result = await store.update(
    input.projectId,
    input.orderId,
    { shipping_status: 'delivered', status: 'completed', delivered_at: now() },
    ['shipped', 'in_transit'],
  )
  if (result === 'error') return { ok: false, error: 'failed' }
  if (result === 'lost') return { ok: false, error: 'conflict' }
  return { ok: true }
}

export type UndeliverOutcome =
  | { ok: true }
  | { ok: false; error: 'not_delivered' | 'cancelled' | 'conflict' | 'failed' | 'not_found' }

export async function markOrderUndelivered(
  store: ShippingOrderStore,
  input: { projectId: string; orderId: string },
): Promise<UndeliverOutcome> {
  const order = await store.find(input.projectId, input.orderId)
  if (!order) return { ok: false, error: 'not_found' }
  if (['cancelled', 'failed', 'refunded'].includes(order.status)) return { ok: false, error: 'cancelled' }
  if (order.shipping_status !== 'delivered') return { ok: false, error: 'not_delivered' }
  const result = await store.update(
    input.projectId,
    input.orderId,
    { shipping_status: 'shipped', status: 'shipped', delivered_at: null },
    ['delivered'],
  )
  if (result === 'error') return { ok: false, error: 'failed' }
  if (result === 'lost') return { ok: false, error: 'conflict' }
  return { ok: true }
}
