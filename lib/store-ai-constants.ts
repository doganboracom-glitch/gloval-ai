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

/** One image request = one image = this many credits when the attempt is paid. */
export const IMAGE_COST_CREDITS = 3

/** Credits charged for one PAID attempt. Text covers the whole package in one request. */
export const STORE_AI_COSTS: Record<StoreAiKind, number> = {
  text: 1,
  image: IMAGE_COST_CREDITS,
}

/**
 * Retry cycle per kind: in a series, attempt n is charged when `(n - 1) % CYCLE === 0`.
 * Text (3): attempts 1, 4, 7 ... are paid; 2, 3, 5, 6 ... are free.
 * Image (2): attempts 1, 3, 5 ... are paid; 2, 4, 6 ... are free.
 */
export const FREE_CYCLE_TEXT = 3
export const FREE_CYCLE_IMAGE = 2

export const STORE_AI_FREE_CYCLE: Record<StoreAiKind, number> = {
  text: FREE_CYCLE_TEXT,
  image: FREE_CYCLE_IMAGE,
}

export function freeCycleFor(kind: StoreAiKind): number {
  return STORE_AI_FREE_CYCLE[kind]
}

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

/**
 * Extra, kind-specific caps checked in addition to the shared `STORE_AI_LIMITS`
 * (which the SQL counts across every kind). Image generation is the expensive
 * call, so it gets a tighter per-user budget of its own.
 */
export const STORE_AI_KIND_LIMITS: Partial<Record<StoreAiKind, { perMinute: number; daily: number }>> = {
  image: { perMinute: 2, daily: 40 },
}

/** Hard stop for a single model call (the route's `maxDuration` is higher). */
export const STORE_AI_MODEL_TIMEOUT_MS = 45_000

/** Ledger `reason` prefixes; the admin credit view shows `reason` as-is. */
export const STORE_AI_LEDGER_REASON: Record<StoreAiKind | 'refund', string> = {
  text: 'store_ai_text',
  image: 'store_ai_image',
  refund: 'store_ai_refund',
}

/** Image generation: the single place to revise model, size and cost assumptions. */
export const STORE_AI_IMAGE = {
  model: 'openai/gpt-image-1-mini',
  size: '1024x1024',
  quality: 'medium',
  /** Hard stop for one image call; the route's `maxDuration` is higher. */
  timeoutMs: 80_000,
  /** Candidates not added to the gallery are deleted after this long. */
  candidateTtlMs: 60 * 60 * 1000,
  /** Per 1M tokens, USD (AI Gateway list price for the model above). */
  usdPerMillionInputTokens: 2,
  usdPerMillionOutputTokens: 8,
  /** Used when the provider returns no usage; measured: ~603 in / 1056 out at 1024px medium. */
  fallbackUsd: 0.0097,
  /** Planning exchange rate for the TRY estimate in logs and reports. */
  tryPerUsd: 42,
  /** Revenue per model call at the worst case (3 credits over a 2-attempt cycle, ex-VAT). */
  breakEvenTryPerCall: 3.75,
} as const

export const STORE_AI_IMAGE_DISCLAIMER =
  'Yapay zekâ görselleri tanıtım amaçlıdır; ürününüzü olduğu gibi yansıttığından emin olun.'

export const STORE_AI_DRAFT_NOTE = 'Yapay zekâ taslağıdır, yayından önce kontrol edin.'

/** 1-based position of the NEXT attempt in its series, given how many succeeded so far. */
export function nextAttemptNumber(succeededCount: number): number {
  return Math.max(0, Math.floor(succeededCount)) + 1
}

/** Whether attempt number `n` (1-based) is charged. */
export function isChargedAttempt(kind: StoreAiKind, n: number): boolean {
  return (n - 1) % freeCycleFor(kind) === 0
}

export function costForAttempt(kind: StoreAiKind, n: number): number {
  return isChargedAttempt(kind, n) ? STORE_AI_COSTS[kind] : 0
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
    cyclePosition: ((attemptNumber - 1) % freeCycleFor(kind)) + 1,
    cycleLength: freeCycleFor(kind),
  }
}

/** Label shown on the button BEFORE the click. */
export function costLabel(next: StoreAiNextAttempt): string {
  return next.cost > 0 ? `${next.cost} kredi` : `Bu deneme ücretsiz (${next.cyclePosition}/${next.cycleLength})`
}
