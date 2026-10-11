import {
  STORE_AI_COSTS,
  describeNextAttempt,
  type StoreAiKind,
  type StoreAiNextAttempt,
} from '@/lib/store-ai-constants'

/**
 * Generic metered-call engine for the store AI assistants (text now, images
 * later). It owns the ORDER of operations; the atomic parts (balance check +
 * ledger write, series counter, concurrency and rate limits, idempotency) live
 * behind `StoreAiPort`, whose production implementation is the SQL in
 * `scripts/039-store-ai-text-assistant.sql`.
 *
 * Guarantees enforced here:
 *  - `work` (the model call) never runs unless `begin` returned `started`.
 *  - Any throw, abort or invalid result calls `finish(false)`, which refunds a
 *    charged attempt and does not advance the series.
 */

export type BeginOutcome = 'started' | 'replay' | 'busy' | 'rate_minute' | 'rate_daily' | 'insufficient'

export type BeginInput = {
  userId: string
  projectId: string
  productKey: string
  kind: StoreAiKind
  requestId: string
}

export type BeginResult = {
  outcome: BeginOutcome
  attemptId: string | null
  attemptNo: number
  charged: number
  balance: number
}

export type FinishStatus = 'succeeded' | 'failed' | 'not_found'

export interface StoreAiPort {
  begin(input: BeginInput): Promise<BeginResult>
  finish(attemptId: string, success: boolean): Promise<FinishStatus>
  resetSeries(projectId: string, productKey: string, kind: StoreAiKind): Promise<void>
  readSucceededCount(projectId: string, productKey: string, kind: StoreAiKind): Promise<number>
  balance(userId: string): Promise<number>
  /** Project that owns a product with this id, or null when no such product exists. */
  findProductProject(productKey: string): Promise<string | null>
}

export type StoreAiErrorCode =
  | 'insufficient_credits'
  | 'busy'
  | 'rate_limited_minute'
  | 'rate_limited_daily'
  | 'duplicate_request'
  | 'forbidden_product'
  | 'refused'
  | 'aborted'
  | 'generation_failed'

/** Thrown by `work` when the model declined or the product is not allowed. */
export class StoreAiRefusal extends Error {
  constructor(message = 'refused') {
    super(message)
    this.name = 'StoreAiRefusal'
  }
}

/** Thrown by `work` when the model returned nothing usable. */
export class StoreAiInvalidResult extends Error {
  constructor(message = 'invalid_result') {
    super(message)
    this.name = 'StoreAiInvalidResult'
  }
}

export type MeteredFailure = {
  ok: false
  error: StoreAiErrorCode
  /** Credits taken for this attempt and given back. */
  refunded: number
  balance?: number
}

export type MeteredResult<T> =
  | { ok: true; value: T; attemptId: string; attemptNo: number; charged: number }
  | MeteredFailure

export type MeteredInput = BeginInput & { signal?: AbortSignal }

/** Owner-of-key check: a key that is already another project's product is refused. */
export async function authorizeProductKey(
  port: Pick<StoreAiPort, 'findProductProject'>,
  projectId: string,
  productKey: string,
): Promise<boolean> {
  const owner = await port.findProductProject(productKey)
  return owner === null || owner === projectId
}

const FINISH_RETRIES = 3

async function finishWithRetry(port: StoreAiPort, attemptId: string, success: boolean): Promise<FinishStatus> {
  let lastError: unknown
  for (let i = 0; i < FINISH_RETRIES; i += 1) {
    try {
      return await port.finish(attemptId, success)
    } catch (error) {
      lastError = error
    }
  }
  console.error('[store-ai] finish failed', {
    attemptId,
    success,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  })
  // The SQL sweep refunds a charged attempt that stays pending too long.
  return 'failed'
}

export async function runMeteredStoreAi<T>(
  port: StoreAiPort,
  input: MeteredInput,
  work: () => Promise<T>,
): Promise<MeteredResult<T>> {
  if (!(await authorizeProductKey(port, input.projectId, input.productKey))) {
    return { ok: false, error: 'forbidden_product', refunded: 0 }
  }

  let begun: BeginResult
  try {
    begun = await port.begin(input)
  } catch (error) {
    console.error('[store-ai] begin failed', {
      kind: input.kind,
      error: error instanceof Error ? error.message : String(error),
    })
    // Fail closed: no ledger access means no model call.
    return { ok: false, error: 'generation_failed', refunded: 0 }
  }

  switch (begun.outcome) {
    case 'insufficient':
      return { ok: false, error: 'insufficient_credits', refunded: 0, balance: begun.balance }
    case 'busy':
      return { ok: false, error: 'busy', refunded: 0 }
    case 'rate_minute':
      return { ok: false, error: 'rate_limited_minute', refunded: 0 }
    case 'rate_daily':
      return { ok: false, error: 'rate_limited_daily', refunded: 0 }
    case 'replay':
      return { ok: false, error: 'duplicate_request', refunded: 0 }
    case 'started':
      break
  }

  const attemptId = begun.attemptId as string
  let value: T
  try {
    if (input.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    value = await work()
  } catch (error) {
    await finishWithRetry(port, attemptId, false)
    const refunded = begun.charged
    if (error instanceof StoreAiRefusal) return { ok: false, error: 'refused', refunded }
    if (error instanceof Error && error.name === 'AbortError') return { ok: false, error: 'aborted', refunded }
    return { ok: false, error: 'generation_failed', refunded }
  }

  await finishWithRetry(port, attemptId, true)
  return { ok: true, value, attemptId, attemptNo: begun.attemptNo, charged: begun.charged }
}

export type StoreAiStatus = {
  balance: number
  next: StoreAiNextAttempt
  canAfford: boolean
}

export async function readStoreAiStatus(
  port: StoreAiPort,
  userId: string,
  projectId: string,
  productKey: string,
  kind: StoreAiKind,
): Promise<StoreAiStatus> {
  const [balance, succeeded] = await Promise.all([
    port.balance(userId),
    port.readSucceededCount(projectId, productKey, kind),
  ])
  const next = describeNextAttempt(kind, succeeded)
  return { balance, next, canAfford: next.cost === 0 || balance >= STORE_AI_COSTS[kind] }
}
