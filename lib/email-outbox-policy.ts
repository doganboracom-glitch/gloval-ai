/**
 * Pure rules of the lifecycle email outbox (`email_events`): lease length,
 * retry schedule and how a provider response maps to retry / give up. Kept free
 * of I/O so the behaviour can be unit tested.
 */

export const MAX_ATTEMPTS = 6
export const LEASE_MS = 2 * 60_000
/** A second "site removed" email for the same project inside this window is never queued. */
export const UNPUBLISH_DEDUPE_MS = 60 * 60_000
/** When mail is not configured the row is parked this long without using up an attempt. */
export const NOT_CONFIGURED_DELAY_MS = 15 * 60_000

/** Wait before the next try, indexed by how many attempts have already been made (1-based). */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 3 * 60 * 60_000]

export function backoffMs(attemptsMade: number): number {
  const index = Math.min(Math.max(attemptsMade, 1), BACKOFF_MS.length) - 1
  return BACKOFF_MS[index]
}

export type FailureClass = { retryable: boolean; code: string }

/**
 * 408/409/425/429 and 5xx are transient (409 is Resend's "concurrent idempotent
 * request"); every other 4xx will not succeed on a retry. `null` = network error.
 */
export function classifyHttpFailure(status: number | null): FailureClass {
  if (status === null) return { retryable: true, code: 'network_error' }
  const retryable = status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
  return { retryable, code: `http_${status}` }
}

export type RetryDecision =
  | { action: 'retry'; nextAttemptAt: Date }
  | { action: 'fail'; code: string }

/** `attemptsMade` already includes the attempt that just failed. */
export function decideRetry(attemptsMade: number, code: string, now: Date): RetryDecision {
  if (attemptsMade >= MAX_ATTEMPTS) return { action: 'fail', code: 'max_attempts' }
  return { action: 'retry', nextAttemptAt: new Date(now.getTime() + backoffMs(attemptsMade)) }
}

const SAFE_CODE = /^[a-z0-9_]{1,64}$/

/**
 * `last_error` only ever receives a short machine code. Anything that is not
 * one (free text, an address, a token) collapses to `unknown_error`.
 */
export function sanitizeErrorCode(code: string): string {
  return SAFE_CODE.test(code) ? code : 'unknown_error'
}
