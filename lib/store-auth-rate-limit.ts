import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { hmacHex } from '@/lib/store-customer-keys'

/**
 * Rate limiter for store customer auth actions.
 *
 * Primary store: Postgres, through the atomic `store_auth_rate_limit_hit` RPC
 * (scripts/031-store-customer-auth-hardening.sql), so limits hold across
 * serverless instances. If the RPC is unavailable (migration not applied yet,
 * transient DB error) it degrades to the per-instance in-memory limiter
 * instead of failing open completely or blocking every customer.
 *
 * Keys are HMAC-hashed before they leave the process, so raw IPs and e-mail
 * addresses are never written to the rate limit table.
 */

export type RateLimitRule = {
  /** Namespace, e.g. `login`. */
  name: string
  /** Subject of the limit, e.g. `ip|email`. Hashed before use. */
  key: string
  limit: number
  windowSeconds: number
}

export type RateLimitOutcome = { allowed: boolean; retryAfterSeconds: number }

export async function hitRateLimit(rule: RateLimitRule): Promise<RateLimitOutcome> {
  const hashed = `${rule.name}:${hmacHex('rate-limit', `${rule.name}|${rule.key}`)}`

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('store_auth_rate_limit_hit', {
      p_key: hashed,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    })
    if (!error && data) {
      const row = (Array.isArray(data) ? data[0] : data) as
        | { allowed?: boolean; retry_after_seconds?: number }
        | undefined
      if (row && typeof row.allowed === 'boolean') {
        return {
          allowed: row.allowed,
          retryAfterSeconds: Number(row.retry_after_seconds ?? 0),
        }
      }
    }
    if (error) console.log('[v0] store auth rate limit rpc error:', error.message)
  } catch (err) {
    console.log('[v0] store auth rate limit rpc failed:', err instanceof Error ? err.message : err)
  }

  const local = checkRateLimit(hashed, rule.limit, rule.windowSeconds * 1000)
  return {
    allowed: local.allowed,
    retryAfterSeconds: Math.ceil(local.retryAfterMs / 1000),
  }
}

/** Evaluates every rule (no short-circuit) and reports whether any blocked. */
export async function anyRateLimited(rules: RateLimitRule[]): Promise<boolean> {
  const outcomes = await Promise.all(rules.map(hitRateLimit))
  return outcomes.some((o) => !o.allowed)
}
