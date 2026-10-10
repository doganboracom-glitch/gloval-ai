import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import { finalizePaidStock, releaseOrderStock } from '@/lib/store-order-stock'
import { isMissingColumnError } from '@/lib/store-schema-compat'
import {
  MANUAL_STORE_PROVIDERS,
  isManualOrderExpired,
  readBankTransferConfig,
} from '@/lib/store-payment-policy'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Lifecycle of orders paid out of band (bank transfer, cash on delivery):
 *
 *   pending/pending --owner confirms--> paid/paid   (stock stays taken)
 *   pending/pending --owner cancels --> cancelled/failed (stock released)
 *   pending/pending --term elapsed  --> cancelled/failed (bank transfer only)
 *
 * Every transition is a conditional UPDATE (`payment_status = 'pending'`), so
 * it happens at most once even under double clicks or concurrent cron runs,
 * and the side effects (stock, e-mail) only fire for the call that won.
 */

export type ManualOrderDeps = {
  finalizePaidStock: (admin: Admin, orderId: string) => Promise<{ oversold: boolean }>
  releaseOrderStock: (
    admin: Admin,
    orderId: string,
    options?: { onlyUnpaid?: boolean },
  ) => Promise<void>
  notifyPaid: (orderId: string) => void
}

export const defaultManualOrderDeps = (notifyPaid: (orderId: string) => void): ManualOrderDeps => ({
  finalizePaidStock,
  releaseOrderStock,
  notifyPaid,
})

export type ManualOrderOutcome =
  | { outcome: 'confirmed'; oversold: boolean }
  | { outcome: 'cancelled' }
  | { outcome: 'not_found' }
  | { outcome: 'not_manual' }
  | { outcome: 'not_pending' }
  | { outcome: 'failed' }

type OrderLookup = { id: string; payment_provider: string; payment_status: string; status: string }

async function lookup(admin: Admin, projectId: string, orderId: string): Promise<OrderLookup | null> {
  const { data } = await admin
    .from('ecommerce_orders')
    .select('id, payment_provider, payment_status, status')
    .eq('id', orderId)
    .eq('project_id', projectId)
    .maybeSingle()
  return (data as OrderLookup | null) ?? null
}

/**
 * Conditional pending -> next transition. The audit columns come from
 * scripts/034; until it is applied the update is retried without them.
 */
async function transition(
  admin: Admin,
  match: { projectId: string; orderId: string },
  patch: Record<string, unknown>,
  audit: Record<string, unknown>,
): Promise<{ moved: boolean; error: boolean }> {
  const run = (values: Record<string, unknown>) =>
    admin
      .from('ecommerce_orders')
      .update(values)
      .eq('id', match.orderId)
      .eq('project_id', match.projectId)
      .eq('payment_status', 'pending')
      .in('payment_provider', [...MANUAL_STORE_PROVIDERS])
      .select('id')

  let { data, error } = await run({ ...patch, ...audit })
  if (error && isMissingColumnError(error)) {
    ;({ data, error } = await run(patch))
  }
  if (error) {
    console.error('[store-manual] transition failed', { orderId: match.orderId, code: error.code })
    return { moved: false, error: true }
  }
  return { moved: Boolean(data && data.length > 0), error: false }
}

/**
 * Marks a pending manual order as paid. `projectId` must already be proven to
 * belong to the acting owner; the order is looked up inside that project only,
 * so an order id from another store is simply "not found".
 */
export async function confirmManualPayment(
  admin: Admin,
  input: { projectId: string; orderId: string; actorId: string },
  deps: ManualOrderDeps,
): Promise<ManualOrderOutcome> {
  const order = await lookup(admin, input.projectId, input.orderId)
  if (!order) return { outcome: 'not_found' }
  if (!(MANUAL_STORE_PROVIDERS as readonly string[]).includes(order.payment_provider)) {
    return { outcome: 'not_manual' }
  }
  if (order.payment_status !== 'pending') return { outcome: 'not_pending' }

  const result = await transition(
    admin,
    input,
    { payment_status: 'paid', status: 'paid' },
    { payment_confirmed_by: input.actorId, payment_confirmed_at: new Date().toISOString() },
  )
  if (result.error) return { outcome: 'failed' }
  if (!result.moved) return { outcome: 'not_pending' }

  const { oversold } = await deps.finalizePaidStock(admin, input.orderId)
  deps.notifyPaid(input.orderId)
  return { outcome: 'confirmed', oversold }
}

/** Cancels a pending manual order and gives its reserved stock back. */
export async function cancelManualOrder(
  admin: Admin,
  input: { projectId: string; orderId: string; actorId: string | null },
  deps: Pick<ManualOrderDeps, 'releaseOrderStock'>,
): Promise<ManualOrderOutcome> {
  const order = await lookup(admin, input.projectId, input.orderId)
  if (!order) return { outcome: 'not_found' }
  if (!(MANUAL_STORE_PROVIDERS as readonly string[]).includes(order.payment_provider)) {
    return { outcome: 'not_manual' }
  }
  if (order.payment_status !== 'pending') return { outcome: 'not_pending' }

  const result = await transition(
    admin,
    input,
    { payment_status: 'failed', status: 'cancelled' },
    { cancelled_by: input.actorId, cancelled_at: new Date().toISOString() },
  )
  if (result.error) return { outcome: 'failed' }
  if (!result.moved) return { outcome: 'not_pending' }

  await deps.releaseOrderStock(admin, input.orderId, { onlyUnpaid: true })
  return { outcome: 'cancelled' }
}

type ExpiryCandidate = { id: string; project_id: string; created_at: string }

/**
 * Cancels bank-transfer orders whose payment term (owner setting, default 3
 * days) has elapsed and frees their stock. Cash-on-delivery orders never
 * expire. Runs from the daily cron and opportunistically from checkout.
 * Returns how many orders were cancelled.
 */
export async function expireStaleManualOrders(
  admin: Admin,
  projectId: string | null,
  deps: Pick<ManualOrderDeps, 'releaseOrderStock'>,
  now: number = Date.now(),
): Promise<number> {
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  let query = admin
    .from('ecommerce_orders')
    .select('id, project_id, created_at')
    .eq('payment_provider', 'bank_transfer')
    .eq('payment_status', 'pending')
    .eq('status', 'pending')
    .lt('created_at', oneDayAgo)
    .order('created_at', { ascending: true })
    .limit(500)
  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) {
    console.error('[store-manual] expiry lookup failed', { code: error.code })
    return 0
  }
  const candidates = (data ?? []) as ExpiryCandidate[]
  if (candidates.length === 0) return 0

  const projectIds = Array.from(new Set(candidates.map((c) => c.project_id)))
  const { data: settings, error: settingsError } = await admin
    .from('ecommerce_payment_settings')
    .select('project_id, public_config')
    .in('project_id', projectIds)
  if (settingsError) {
    console.error('[store-manual] term lookup failed', { code: settingsError.code })
    return 0
  }
  const termByProject = new Map<string, number>()
  for (const s of (settings ?? []) as { project_id: string; public_config: unknown }[]) {
    termByProject.set(s.project_id, readBankTransferConfig(s.public_config).termDays)
  }

  let cancelled = 0
  for (const c of candidates) {
    const term = termByProject.get(c.project_id) ?? readBankTransferConfig(null).termDays
    if (!isManualOrderExpired(c.created_at, now, term)) continue
    const res = await cancelManualOrder(
      admin,
      { projectId: c.project_id, orderId: c.id, actorId: null },
      deps,
    )
    if (res.outcome === 'cancelled') cancelled++
  }
  return cancelled
}
