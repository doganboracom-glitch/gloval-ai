/**
 * Single source of truth for the store AI assistants' credit rules.
 *
 * Text (this feature) and image generation (a later feature) share one engine,
 * so costs, the retry cycle and the abuse limits live here and nowhere else.
 * The SQL functions in `scripts/039-store-ai-text-assistant.sql` receive these
 * numbers as parameters; they hold no policy of their own.
 */

export type StoreAiKind = 'text' | 'image'

export const STORE_AI_KINDS: readonly StoreAiKind[] = ['text', 'image']

/** Credits charged for one PAID attempt. Text covers the whole package in one request. */
export const STORE_AI_COSTS: Record<StoreAiKind, number> = {
  text: 1,
  image: 2,
}

/**
 * Retry cycle: in a series, attempt n is charged when `(n - 1) % CYCLE === 0`.
 * With 3 -> attempts 1, 4, 7 ... are paid; 2, 3, 5, 6 ... are free.
 */
export const STORE_AI_FREE_CYCLE = 3

export const STORE_AI_LIMITS = {
  /** Requests started per user per rolling minute. */
  perMinute: 6,
  /** Requests running at the same time per user. */
  concurrent: 1,
  /** Requests started per user per rolling 24 hours. */
  daily: 200,
  /** A request still "running" after this long is treated as dead and refunded. */
  staleSeconds: 120,
} as const

/** Hard stop for a single model call (the route's `maxDuration` is higher). */
export const STORE_AI_MODEL_TIMEOUT_MS = 45_000

/** Ledger `reason` prefixes; the admin credit view shows `reason` as-is. */
export const STORE_AI_LEDGER_REASON: Record<StoreAiKind | 'refund', string> = {
  text: 'store_ai_text',
  image: 'store_ai_image',
  refund: 'store_ai_refund',
}

export const STORE_AI_DRAFT_NOTE = 'Yapay zekâ taslağıdır, yayından önce kontrol edin.'

/** 1-based position of the NEXT attempt in its series, given how many succeeded so far. */
export function nextAttemptNumber(succeededCount: number): number {
  return Math.max(0, Math.floor(succeededCount)) + 1
}

/** Whether attempt number `n` (1-based) is charged. */
export function isChargedAttempt(n: number): boolean {
  return (n - 1) % STORE_AI_FREE_CYCLE === 0
}

export function costForAttempt(kind: StoreAiKind, n: number): number {
  return isChargedAttempt(n) ? STORE_AI_COSTS[kind] : 0
}

export type StoreAiNextAttempt = {
  attemptNumber: number
  cost: number
  /** 1..CYCLE position inside the current series. */
  cyclePosition: number
  cycleLength: number
}

export function describeNextAttempt(kind: StoreAiKind, succeededCount: number): StoreAiNextAttempt {
  const attemptNumber = nextAttemptNumber(succeededCount)
  return {
    attemptNumber,
    cost: costForAttempt(kind, attemptNumber),
    cyclePosition: ((attemptNumber - 1) % STORE_AI_FREE_CYCLE) + 1,
    cycleLength: STORE_AI_FREE_CYCLE,
  }
}

/** Label shown on the button BEFORE the click. */
export function costLabel(next: StoreAiNextAttempt): string {
  return next.cost > 0 ? `${next.cost} kredi` : `Bu deneme ücretsiz (${next.cyclePosition}/${next.cycleLength})`
}
