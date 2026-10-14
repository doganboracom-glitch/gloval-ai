import type { createAdminClient } from '@/lib/supabase/admin'
import { isMissingColumnError } from '@/lib/store-schema-compat'
import {
  cancelPayment,
  evaluateRetrieve,
  refundItemTransaction,
  retrieveCheckoutForm,
  type FetchLike,
  type IyzicoCredentials,
  type RetrieveData,
} from '@/lib/store-payments/iyzico'
import { clearOrderAttention, flagOrderAttention, type AttentionDeps } from '@/lib/store-order-attention'
import type { RefundErrorCode } from '@/lib/store-refund-status'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Cancel / refund of a PAID iyzico order, as a state machine on
 * `ecommerce_orders.refund_status`:
 *
 *   null | failed --claim--> pending --iyzico ok--> (payment refunded, order cancelled, succeeded)
 *
 * - The claim is a conditional update, so two clicks (or a click and the cron)
 *   can never both call iyzico.
 * - iyzico is called BEFORE any order change; a definitive refusal leaves the
 *   order exactly as it was (`failed`, retryable).
 * - Progress (which step already succeeded at iyzico) is stored on the order,
 *   so a retry skips finished steps and a multi-item refund never repeats an
 *   item.
 * - An attempt with an UNKNOWN outcome (timeout, crash) stays `pending`. Its
 *   retry is only trusted while it succeeds; if iyzico then refuses, the
 *   refusal may simply mean "already done", so the owner is asked to verify in
 *   the iyzico panel instead of the order being marked failed or refunded.
 */

/** A `pending` claim older than this is an attempt whose outcome is unknown. */
export const REFUND_LEASE_MS = 2 * 60 * 1000

export type RefundDeps = {
  /** Gives the order's reserved stock back; false when it could not be released. */
  releaseStock: (admin: Admin, orderId: string) => Promise<boolean>
  /** Tells the buyer about the refund; false when the e-mail could not be sent. */
  notifyRefunded: (orderId: string) => Promise<boolean>
  attention: AttentionDeps
}

export type RefundMethod = 'cancel' | 'refund'

export type RefundOutcome =
  | { ok: true; already: boolean; method: RefundMethod | null; followUp: 'done' | 'attention' }
  | { ok: false; error: RefundErrorCode; rejectionCode?: string }

type Progress = { method: RefundMethod; total: number; done: { id: string; ref: string }[] }

type RefundOrder = {
  id: string
  project_id: string
  payment_provider: string
  payment_status: string
  status: string
  payment_ref: string | null
  provider_payment_id: string | null
  total_cents: number
  currency: string
  created_at: string
  refund_status: string | null
  refund_items: unknown
}

const ORDER_COLUMNS =
  'id, project_id, payment_provider, payment_status, status, payment_ref, provider_payment_id, total_cents, currency, created_at, refund_status, refund_items'

export function readProgress(value: unknown): Progress | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (v.method !== 'cancel' && v.method !== 'refund') return null
  const total = Number(v.total)
  if (!Number.isInteger(total) || total < 1) return null
  const done = Array.isArray(v.done)
    ? v.done
        .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
        .map((d) => ({ id: String(d.id ?? ''), ref: String(d.ref ?? '') }))
        .filter((d) => d.id)
    : []
  return { method: v.method, total, done }
}

export function progressComplete(progress: Progress | null): boolean {
  return !!progress && progress.done.length >= progress.total
}

export function progressRef(progress: Progress): string {
  return progress.done
    .map((d) => d.ref || d.id)
    .join(', ')
    .slice(0, 200)
}

const ISTANBUL_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** iyzico only allows a cancel on the day of the payment (Turkey calendar day). */
export function isSameIstanbulDay(aIso: string, nowMs: number): boolean {
  const a = new Date(aIso)
  if (Number.isNaN(a.getTime())) return false
  return ISTANBUL_DAY.format(a) === ISTANBUL_DAY.format(new Date(nowMs))
}

/**
 * The per-item amounts of a full refund: what the buyer paid for each basket
 * item. Null when iyzico's item list does not add up to the payment, in which
 * case nothing is sent.
 */
export function planRefundItems(data: RetrieveData): { id: string; cents: number }[] | null {
  const items = data.items ?? []
  if (items.length === 0 || data.paidPriceCents === null) return null
  const plan: { id: string; cents: number }[] = []
  for (const item of items) {
    const cents = item.paidPriceCents ?? item.priceCents
    if (cents === null) return null
    if (cents > 0) plan.push({ id: item.paymentTransactionId, cents })
  }
  const sum = plan.reduce((acc, p) => acc + p.cents, 0)
  if (plan.length === 0 || sum !== data.paidPriceCents) return null
  return plan
}

async function setProgress(admin: Admin, orderId: string, progress: Progress): Promise<boolean> {
  const { error } = await admin
    .from('ecommerce_orders')
    .update({ refund_items: progress })
    .eq('id', orderId)
    .eq('refund_status', 'pending')
  if (error) console.error('[store-refund] progress not saved', { orderId, code: error.code })
  return !error
}

async function settleAttempt(
  admin: Admin,
  orderId: string,
  status: 'pending' | 'failed',
  errorCode: string,
): Promise<void> {
  const { error } = await admin
    .from('ecommerce_orders')
    .update({ refund_status: status, refund_error: errorCode })
    .eq('id', orderId)
    .eq('refund_status', 'pending')
  if (error) console.error('[store-refund] attempt state not saved', { orderId, code: error.code })
}

type ClaimKind = 'fresh' | 'retry' | 'stale'

async function claimRefund(
  admin: Admin,
  order: Pick<RefundOrder, 'id' | 'project_id'>,
  kind: ClaimKind,
  nowMs: number,
): Promise<'claimed' | 'busy' | 'error'> {
  let query = admin
    .from('ecommerce_orders')
    .update({ refund_status: 'pending', refund_started_at: new Date(nowMs).toISOString(), refund_error: null })
    .eq('id', order.id)
    .eq('project_id', order.project_id)
    .eq('payment_status', 'paid')
  if (kind === 'fresh') query = query.is('refund_status', null)
  else if (kind === 'retry') query = query.eq('refund_status', 'failed')
  else {
    query = query
      .eq('refund_status', 'pending')
      .lt('refund_started_at', new Date(nowMs - REFUND_LEASE_MS).toISOString())
  }
  const { data, error } = await query.select('id')
  if (error) {
    console.error('[store-refund] claim failed', { orderId: order.id, code: error.code })
    return 'error'
  }
  return data && data.length > 0 ? 'claimed' : 'busy'
}

export async function runRefundFollowUps(
  admin: Admin,
  deps: RefundDeps,
  orderId: string,
): Promise<'done' | 'attention'> {
  let stockOk = false
  try {
    stockOk = await deps.releaseStock(admin, orderId)
  } catch {
    stockOk = false
  }
  if (!stockOk) await flagOrderAttention(admin, { orderId, step: 'release_stock' }, deps.attention)

  let notified = false
  try {
    notified = await deps.notifyRefunded(orderId)
  } catch {
    notified = false
  }
  if (!notified) await flagOrderAttention(admin, { orderId, step: 'refund_notify' }, deps.attention)

  return stockOk && notified ? 'done' : 'attention'
}

/**
 * Last step: the money is back at the buyer, so the order becomes cancelled +
 * refunded. Conditional on the claim, so it applies once.
 */
export async function finalizeRefund(
  admin: Admin,
  deps: RefundDeps,
  order: Pick<RefundOrder, 'id' | 'project_id'>,
  method: RefundMethod,
  ref: string,
  nowMs: number = Date.now(),
): Promise<RefundOutcome> {
  const { data, error } = await admin
    .from('ecommerce_orders')
    .update({
      payment_status: 'refunded',
      status: 'cancelled',
      refund_status: 'succeeded',
      refund_ref: ref || null,
      refund_error: null,
      refunded_at: new Date(nowMs).toISOString(),
    })
    .eq('id', order.id)
    .eq('project_id', order.project_id)
    .eq('refund_status', 'pending')
    .eq('payment_status', 'paid')
    .select('id')
  if (error) {
    console.error('[store-refund] order not finalized after iyzico refund', { orderId: order.id, code: error.code })
    await flagOrderAttention(admin, { orderId: order.id, step: 'refund_finalize' }, deps.attention)
    return { ok: false, error: 'finalize_failed' }
  }
  if (!data || data.length === 0) {
    const { data: row } = await admin
      .from('ecommerce_orders')
      .select('refund_status')
      .eq('id', order.id)
      .maybeSingle()
    if ((row as { refund_status?: string } | null)?.refund_status === 'succeeded') {
      return { ok: true, already: true, method, followUp: 'done' }
    }
    return { ok: false, error: 'in_progress' }
  }
  const followUp = await runRefundFollowUps(admin, deps, order.id)
  return { ok: true, already: false, method, followUp }
}

/**
 * Reverses the full payment (products + shipping) of one paid iyzico order with
 * the store's own keys. Same Turkey day as the payment: cancel (falling back to
 * refund if iyzico refuses the cancel); later: refund per basket item.
 */
export async function refundIyzicoOrder(
  admin: Admin,
  creds: IyzicoCredentials,
  input: { projectId: string; orderId: string },
  deps: RefundDeps,
  options: { fetchImpl?: FetchLike; now?: number } = {},
): Promise<RefundOutcome> {
  const nowMs = options.now ?? Date.now()

  const { data, error: readError } = await admin
    .from('ecommerce_orders')
    .select(ORDER_COLUMNS)
    .eq('id', input.orderId)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (isMissingColumnError(readError)) return { ok: false, error: 'unsupported' }
  if (readError) {
    console.error('[store-refund] order lookup failed', { orderId: input.orderId, code: readError.code })
    return { ok: false, error: 'unavailable' }
  }
  if (!data) return { ok: false, error: 'not_found' }
  const order = data as unknown as RefundOrder

  if (order.payment_provider !== 'iyzico') return { ok: false, error: 'not_card' }
  if (order.refund_status === 'succeeded' || order.payment_status === 'refunded') {
    return { ok: true, already: true, method: readProgress(order.refund_items)?.method ?? null, followUp: 'done' }
  }
  if (order.payment_status !== 'paid') return { ok: false, error: 'not_paid' }

  const kind: ClaimKind =
    order.refund_status === 'failed' ? 'retry' : order.refund_status === 'pending' ? 'stale' : 'fresh'
  const claimed = await claimRefund(admin, order, kind, nowMs)
  if (claimed === 'error') return { ok: false, error: 'unavailable' }
  if (claimed === 'busy') return { ok: false, error: 'in_progress' }
  const wasAmbiguous = kind === 'stale'

  let sent = false
  const stop = async (
    error: RefundErrorCode,
    reason: 'definitive' | 'unknown',
    rejectionCode = '',
  ): Promise<RefundOutcome> => {
    // Only a refusal on a first, clean attempt is a plain failure. Anything that
    // may have reached iyzico (or follows an unknown attempt) stays pending.
    const uncertain = reason === 'unknown' || wasAmbiguous
    if (uncertain) {
      await settleAttempt(admin, order.id, 'pending', reason === 'unknown' ? 'unknown' : 'verify')
      return { ok: false, error: reason === 'unknown' ? error : wasAmbiguous && sent ? 'verify_manually' : error }
    }
    await settleAttempt(admin, order.id, 'failed', rejectionCode || error)
    return { ok: false, error, rejectionCode }
  }

  let progress = readProgress(order.refund_items)
  if (progressComplete(progress) && progress) {
    return finalizeRefund(admin, deps, order, progress.method, progressRef(progress), nowMs)
  }

  const token = order.payment_ref
  if (!token) return stop('no_payment_id', 'definitive')

  const retrieved = await retrieveCheckoutForm(creds, token, order.id, options.fetchImpl)
  const verdict = evaluateRetrieve(retrieved, {
    id: order.id,
    totalCents: order.total_cents,
    currency: order.currency,
  })
  if (verdict.kind === 'unavailable') return stop('unavailable', 'definitive')
  if (verdict.kind !== 'paid' || retrieved.kind !== 'ok') {
    return stop(wasAmbiguous ? 'verify_manually' : 'amount_mismatch', 'definitive')
  }
  if (order.provider_payment_id && order.provider_payment_id !== verdict.paymentId) {
    return stop('amount_mismatch', 'definitive')
  }
  const paymentId = verdict.paymentId
  const currency = order.currency

  const plan = planRefundItems(retrieved.data)
  let method: RefundMethod = progress?.method ?? (isSameIstanbulDay(order.created_at, nowMs) ? 'cancel' : 'refund')

  if (method === 'cancel') {
    progress = { method: 'cancel', total: 1, done: [] }
    if (!(await setProgress(admin, order.id, progress))) return stop('unavailable', 'definitive')
    sent = true
    const res = await cancelPayment(creds, { paymentId, conversationId: `cancel:${order.id}` }, options.fetchImpl)
    if (res.kind === 'ok') {
      progress.done.push({ id: paymentId, ref: res.ref })
      if (!(await setProgress(admin, order.id, progress))) return stop('verify_manually', 'unknown')
      return finalizeRefund(admin, deps, order, 'cancel', progressRef(progress), nowMs)
    }
    if (res.kind === 'unavailable') return stop('unavailable', 'unknown')
    if (res.kind === 'auth') return stop('auth', 'definitive')
    // iyzico refused the cancel (for example after the bank's day-end): a refund is the next route.
    if (wasAmbiguous) return stop('verify_manually', 'definitive', res.code)
    method = 'refund'
    progress = null
  }

  if (!plan) return stop('amount_mismatch', 'definitive')
  if (!progress || progress.method !== 'refund') {
    progress = { method: 'refund', total: plan.length, done: [] }
    if (!(await setProgress(admin, order.id, progress))) return stop('unavailable', 'definitive')
  }
  const done = new Set(progress.done.map((d) => d.id))
  for (const item of plan) {
    if (done.has(item.id)) continue
    sent = true
    const res = await refundItemTransaction(
      creds,
      {
        paymentTransactionId: item.id,
        priceCents: item.cents,
        currency,
        conversationId: `refund:${order.id}`,
      },
      options.fetchImpl,
    )
    if (res.kind === 'ok') {
      progress.done.push({ id: item.id, ref: res.ref })
      if (!(await setProgress(admin, order.id, progress))) return stop('verify_manually', 'unknown')
      continue
    }
    if (res.kind === 'unavailable') return stop('unavailable', 'unknown')
    if (res.kind === 'auth') return stop('auth', 'definitive')
    return stop('rejected', 'definitive', res.code)
  }
  return finalizeRefund(admin, deps, order, 'refund', progressRef(progress), nowMs)
}

export type RefundReconcileSummary = { finalized: number; followedUp: number; skipped: number }

const RECONCILE_BATCH = 25

/**
 * Self-healing for refunds that already happened at iyzico:
 * (a) a `pending` refund whose steps all succeeded but whose final order
 *     update failed is finalized (no iyzico call);
 * (b) a refunded order whose stock release / buyer e-mail failed is retried and
 *     its attention flag cleared once both succeed.
 * Refunds with unfinished steps are left to the owner's "retry".
 */
export async function reconcileRefundFollowUps(
  admin: Admin,
  deps: RefundDeps,
  options: { deadlineMs: number; now?: number },
): Promise<RefundReconcileSummary> {
  const nowMs = options.now ?? Date.now()
  const summary: RefundReconcileSummary = { finalized: 0, followedUp: 0, skipped: 0 }

  const { data: stuck, error: stuckError } = await admin
    .from('ecommerce_orders')
    .select('id, project_id, refund_items')
    .eq('refund_status', 'pending')
    .eq('payment_status', 'paid')
    .lt('refund_started_at', new Date(nowMs - REFUND_LEASE_MS).toISOString())
    .limit(RECONCILE_BATCH)
  if (stuckError) {
    if (!isMissingColumnError(stuckError)) console.error('[store-refund] reconcile lookup failed', { code: stuckError.code })
    return summary
  }
  for (const row of (stuck ?? []) as { id: string; project_id: string; refund_items: unknown }[]) {
    if (Date.now() >= options.deadlineMs) return summary
    const progress = readProgress(row.refund_items)
    if (!progress || !progressComplete(progress)) {
      summary.skipped += 1
      continue
    }
    const res = await finalizeRefund(admin, deps, row, progress.method, progressRef(progress), nowMs)
    if (res.ok) summary.finalized += 1
    else summary.skipped += 1
  }

  const { data: refunded, error: refundedError } = await admin
    .from('ecommerce_orders')
    .select('id, attention_at, attention_reason')
    .eq('refund_status', 'succeeded')
    .or('stock_reserved.eq.true,attention_at.not.is.null')
    .limit(RECONCILE_BATCH)
  if (refundedError) {
    if (!isMissingColumnError(refundedError)) console.error('[store-refund] follow-up lookup failed', { code: refundedError.code })
    return summary
  }
  for (const row of (refunded ?? []) as { id: string; attention_at: string | null; attention_reason: string | null }[]) {
    if (Date.now() >= options.deadlineMs) break
    let stockOk = false
    try {
      stockOk = await deps.releaseStock(admin, row.id)
    } catch {
      stockOk = false
    }
    let notified = true
    if (row.attention_reason === 'refund_notify') {
      try {
        notified = await deps.notifyRefunded(row.id)
      } catch {
        notified = false
      }
    }
    if (stockOk && notified) {
      if (row.attention_at) await clearOrderAttention(admin, row.id)
      summary.followedUp += 1
    } else {
      summary.skipped += 1
    }
  }
  return summary
}
