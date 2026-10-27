/**
 * Display-only helpers for the "your payment went through" notice on /billing.
 * Nothing here grants or verifies anything: the verified callback/webhook does
 * that. The notice only reflects the server-confirmed outcome.
 */

export type PaymentNoticeTarget =
  | { kind: 'credits'; credits: number }
  | { kind: 'named'; name: string }

export type PaymentOutcome = 'success' | 'failed' | 'pending' | 'none'

export interface PendingPayment {
  /** Epoch ms; only ledger rows created at/after this belong to the checkout. */
  since: number
  target: PaymentNoticeTarget
}

export const PENDING_PAYMENT_KEY = 'gloval:pending-payment'
export const PENDING_PAYMENT_TTL_MS = 3 * 60 * 60 * 1000
/** The ledger row is written before the checkout URL reaches the browser. */
export const PENDING_PAYMENT_SLACK_MS = 2 * 60 * 1000

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** localStorage (not sessionStorage) so a checkout opened in another tab can hand off. */
export function savePendingPayment(
  target: PaymentNoticeTarget,
  now: number = Date.now(),
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage) return
  const record: PendingPayment = { since: now - PENDING_PAYMENT_SLACK_MS, target }
  try {
    storage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(record))
  } catch {
    // Storage can be full or blocked; the in-page iframe flow still works.
  }
}

export function readPendingPayment(
  now: number = Date.now(),
  storage: StorageLike | null = browserStorage(),
): PendingPayment | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PENDING_PAYMENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingPayment> | null
    const target = parsed?.target
    const validTarget =
      (target?.kind === 'credits' && Number.isFinite(target.credits)) ||
      (target?.kind === 'named' && typeof target.name === 'string')
    if (
      !parsed ||
      typeof parsed.since !== 'number' ||
      !validTarget ||
      now - parsed.since > PENDING_PAYMENT_TTL_MS
    ) {
      storage.removeItem(PENDING_PAYMENT_KEY)
      return null
    }
    return { since: parsed.since, target: target as PaymentNoticeTarget }
  } catch {
    return null
  }
}

export function clearPendingPayment(storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.removeItem(PENDING_PAYMENT_KEY)
  } catch {
    // ignore
  }
}

export interface PaymentNoticeCopy {
  successCredits: string
  successNamed: string
}

export function formatPaymentSuccess(copy: PaymentNoticeCopy, target: PaymentNoticeTarget): string {
  return target.kind === 'credits'
    ? copy.successCredits.replace('{credits}', String(target.credits))
    : copy.successNamed.replace('{name}', target.name)
}

export interface OutcomeRow {
  created_at: string
  /** `billing_transactions.status` or `addon_purchases.status`. */
  status: string
}

/**
 * The newest ledger row of the checkout decides: an older failed attempt must
 * not mask a newer pending/paid one. A charged-but-not-granted add-on
 * (`paid`, `manual_refund_required`) stays "pending" so no false success shows.
 */
export function decidePaymentOutcome(rows: OutcomeRow[]): PaymentOutcome {
  if (rows.length === 0) return 'none'
  const newest = rows.reduce((a, b) => (Date.parse(b.created_at) > Date.parse(a.created_at) ? b : a))
  switch (newest.status) {
    case 'succeeded':
    case 'granted':
      return 'success'
    case 'failed':
      return 'failed'
    default:
      return 'pending'
  }
}

export function clampSince(sinceMs: number, now: number): number {
  if (!Number.isFinite(sinceMs)) return now - PENDING_PAYMENT_SLACK_MS
  return Math.min(now, Math.max(now - PENDING_PAYMENT_TTL_MS, sinceMs))
}
