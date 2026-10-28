import { TOPUP_ORDER_PREFIX } from '@/lib/pricing-config'

/**
 * A pending charge is only written off once its iyzico checkout token can no
 * longer be paid: the hosted page lives about 30 minutes, plus a safety margin.
 * A verified SUCCESS is never delayed by this window.
 */
export const RECONCILE_GRACE_MS = 35 * 60 * 1000

/**
 * `billing_transactions.idempotency_key` prefixes in scope: AI credit top-up,
 * subscription (first payment), upgrade and per-site right. Add-on purchases
 * live in `addon_purchases`. Domain registration, transfer, renewal and
 * subscription renewal rows are deliberately out of scope.
 */
export const RECONCILABLE_KEY_PREFIXES = [TOPUP_ORDER_PREFIX, 'sub_', 'upgrade_', 'ent_'] as const

export function isReconcilableLedgerKey(key: string | null | undefined): boolean {
  if (!key) return false
  return RECONCILABLE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/**
 * How long an `abandoned` payment keeps being re-checked with iyzico. A buyer
 * can still pay in a tab opened earlier, or a callback can arrive late, so a
 * written-off record must not be forgotten right away — but never forever.
 */
export const ABANDONED_RESCAN_WINDOW_MS = 24 * 60 * 60 * 1000

export type PendingPayment = {
  id: string
  source: 'ledger' | 'addon'
  /** iyzico checkout-form token, stored as `provider_ref`. */
  token: string
  createdAt: string
  /** Defaults to `pending`; `abandoned` rows are only re-scanned for a late SUCCESS. */
  status?: 'pending' | 'abandoned'
}

export type RetrieveVerdict =
  | { kind: 'paid'; raw: Record<string, unknown> }
  | { kind: 'not_paid'; explicitFailure: boolean }
  | { kind: 'unknown_token' }
  | { kind: 'transient' }

export type ReconcileAction =
  | 'settle_paid'
  | 'settle_failed'
  | 'abandon'
  | 'skip_young'
  | 'skip_transient'
  | 'skip_abandoned'

const AUTH_OR_CONFIG_ERROR = /api|secret|signature|imza|yetki|authori|credential|hash|key/i

/**
 * Turns iyzico's retrieve response into a verdict. A request-level failure that
 * looks like a credential/signature problem is transient (it says nothing about
 * the payment), anything else means iyzico does not know the token.
 */
export function classifyRetrieval(retrieved: {
  paid: boolean
  raw: Record<string, unknown>
}): RetrieveVerdict {
  if (retrieved.paid) return { kind: 'paid', raw: retrieved.raw }
  const requestStatus = String(retrieved.raw.status ?? '')
  if (requestStatus === 'success') {
    return { kind: 'not_paid', explicitFailure: String(retrieved.raw.paymentStatus ?? '') === 'FAILURE' }
  }
  const errorText = `${String(retrieved.raw.errorMessage ?? '')} ${String(retrieved.raw.errorGroup ?? '')}`
  if (AUTH_OR_CONFIG_ERROR.test(errorText)) return { kind: 'transient' }
  return { kind: 'unknown_token' }
}

/**
 * - paid: settled immediately, whatever the age.
 * - transient provider trouble: the record is never touched.
 * - failure / unknown token: only written once `created_at` + 35 minutes passed.
 * - an already `abandoned` row is only ever settled by a verified SUCCESS; any
 *   other verdict leaves it as it is.
 */
export function decideReconcileAction(input: {
  verdict: RetrieveVerdict
  createdAtMs: number
  nowMs: number
  status?: 'pending' | 'abandoned'
}): ReconcileAction {
  const { verdict, createdAtMs, nowMs, status } = input
  if (verdict.kind === 'transient') return 'skip_transient'
  if (verdict.kind === 'paid') return 'settle_paid'
  if (status === 'abandoned') return 'skip_abandoned'
  if (nowMs < createdAtMs + RECONCILE_GRACE_MS) return 'skip_young'
  if (verdict.kind === 'not_paid' && verdict.explicitFailure) return 'settle_failed'
  return 'abandon'
}

export type CloseAction = 'settle_paid' | 'abandon' | 'skip_transient'

/**
 * The buyer closed the payment window. Paid is settled as usual; provider
 * trouble leaves the record to the cron; anything else is abandoned at once,
 * with no 35-minute wait (there is nothing left for the buyer to continue).
 */
export function decideCloseAction(verdict: RetrieveVerdict): CloseAction {
  if (verdict.kind === 'paid') return 'settle_paid'
  if (verdict.kind === 'transient') return 'skip_transient'
  return 'abandon'
}

export type CloseOutcome = 'none' | 'paid' | 'abandoned' | 'unchanged'

export type CloseDeps = {
  /** Newest still-`pending` record that belongs to the signed-in user. */
  findNewestPending: () => Promise<PendingPayment | null>
  retrieve: ReconcileDeps['retrieve']
  settle: ReconcileDeps['settle']
  abandon: ReconcileDeps['abandon']
}

export async function runCloseCheckout(deps: CloseDeps): Promise<CloseOutcome> {
  const payment = await deps.findNewestPending()
  if (!payment) return 'none'
  const verdict = await deps.retrieve(payment.token)
  const action = decideCloseAction(verdict)
  if (action === 'settle_paid' && verdict.kind === 'paid') {
    await deps.settle(payment.token, 'paid', verdict.raw)
    return 'paid'
  }
  if (action === 'abandon') {
    await deps.abandon(payment)
    return 'abandoned'
  }
  return 'unchanged'
}

export type ReconcileDeps = {
  now: () => number
  listPending: (limit: number) => Promise<PendingPayment[]>
  /** Must resolve to `transient` instead of throwing on provider errors. */
  retrieve: (token: string) => Promise<RetrieveVerdict>
  settle: (token: string, status: 'paid' | 'failed', raw?: Record<string, unknown>) => Promise<void>
  abandon: (payment: PendingPayment) => Promise<void>
}

export type ReconcileSummary = {
  checked: number
  paid: number
  failed: number
  abandoned: number
  skippedYoung: number
  skippedTransient: number
  skippedAbandoned: number
  errors: number
}

export const emptyReconcileSummary = (): ReconcileSummary => ({
  checked: 0,
  paid: 0,
  failed: 0,
  abandoned: 0,
  skippedYoung: 0,
  skippedTransient: 0,
  skippedAbandoned: 0,
  errors: 0,
})

export async function runReconciliation(
  deps: ReconcileDeps,
  options: { limit: number; deadlineMs?: number },
): Promise<ReconcileSummary> {
  const summary = emptyReconcileSummary()
  const pending = await deps.listPending(options.limit)
  for (const payment of pending) {
    if (options.deadlineMs !== undefined && deps.now() >= options.deadlineMs) break
    summary.checked += 1
    try {
      const verdict = await deps.retrieve(payment.token)
      const action = decideReconcileAction({
        verdict,
        createdAtMs: new Date(payment.createdAt).getTime(),
        nowMs: deps.now(),
        status: payment.status,
      })
      if (action === 'settle_paid' && verdict.kind === 'paid') {
        await deps.settle(payment.token, 'paid', verdict.raw)
        summary.paid += 1
      } else if (action === 'settle_failed') {
        await deps.settle(payment.token, 'failed')
        summary.failed += 1
      } else if (action === 'abandon') {
        await deps.abandon(payment)
        summary.abandoned += 1
      } else if (action === 'skip_young') {
        summary.skippedYoung += 1
      } else if (action === 'skip_abandoned') {
        summary.skippedAbandoned += 1
      } else {
        summary.skippedTransient += 1
      }
    } catch (error) {
      summary.errors += 1
      console.log('[v0] reconcile: row failed', error instanceof Error ? error.message : String(error))
    }
  }
  return summary
}
