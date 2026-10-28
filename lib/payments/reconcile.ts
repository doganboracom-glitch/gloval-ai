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

export type PendingPayment = {
  id: string
  source: 'ledger' | 'addon'
  /** iyzico checkout-form token, stored as `provider_ref`. */
  token: string
  createdAt: string
}

export type RetrieveVerdict =
  | { kind: 'paid'; raw: Record<string, unknown> }
  | { kind: 'not_paid'; explicitFailure: boolean }
  | { kind: 'unknown_token' }
  | { kind: 'transient' }

export type ReconcileAction = 'settle_paid' | 'settle_failed' | 'abandon' | 'skip_young' | 'skip_transient'

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
 */
export function decideReconcileAction(input: {
  verdict: RetrieveVerdict
  createdAtMs: number
  nowMs: number
}): ReconcileAction {
  const { verdict, createdAtMs, nowMs } = input
  if (verdict.kind === 'transient') return 'skip_transient'
  if (verdict.kind === 'paid') return 'settle_paid'
  if (nowMs < createdAtMs + RECONCILE_GRACE_MS) return 'skip_young'
  if (verdict.kind === 'not_paid' && verdict.explicitFailure) return 'settle_failed'
  return 'abandon'
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
  errors: number
}

export async function runReconciliation(
  deps: ReconcileDeps,
  options: { limit: number; deadlineMs?: number },
): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = {
    checked: 0,
    paid: 0,
    failed: 0,
    abandoned: 0,
    skippedYoung: 0,
    skippedTransient: 0,
    errors: 0,
  }
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
