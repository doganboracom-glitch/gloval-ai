/**
 * Minimal in-memory sliding-window-ish (fixed window) rate limiter.
 *
 * No shared rate-limiting infrastructure exists in this codebase yet (Redis,
 * Upstash, etc.), so this is a deliberately small stopgap for
 * cost-sensitive/abuse-prone actions (e.g. domain availability lookups against
 * a paid registrar API). Known limitation: state is per server instance and
 * resets on redeploy/restart — acceptable for now because the real backstop is
 * the registrar's own account-level rate limits, not this. Replace with a
 * shared store if/when multi-instance correctness matters.
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

// Prevent unbounded growth from many distinct keys (e.g. per-IP) over a long
// process lifetime. Cheap opportunistic sweep, not a precise LRU.
function sweep(now: number) {
  if (buckets.size < 5000) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export type RateLimitResult = {
  allowed: boolean
  /** Milliseconds until the caller may retry; 0 when allowed. */
  retryAfterMs: number
}

/** Fixed-window limiter: at most `limit` calls per `windowMs` per `key`. */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterMs: 0 }
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now }
  }

  bucket.count += 1
  return { allowed: true, retryAfterMs: 0 }
}
