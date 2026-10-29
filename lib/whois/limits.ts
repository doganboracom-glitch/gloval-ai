import { createHash } from 'node:crypto'
import { rpcLimiter, type LimiterDeps, type Window } from '@/lib/custom-domains/public-search/limits'

export { resolveRateLimitIp } from '@/lib/custom-domains/public-search/limits'
export { rpcLimiter }

/**
 * Anonymous per-IP budget on the shared `reserve_rate_limit` counters (no
 * schema change). The subject only ever carries a salted digest, never the IP.
 */
export const WHOIS_LIMITS: readonly Window[] = [
  { seconds: 60, limit: 8 },
  { seconds: 3600, limit: 80 },
]

export function whoisIdentityKey(ip: string | null): string {
  return createHash('sha256').update(`whois:${ip ?? 'unknown'}`).digest('hex').slice(0, 32)
}

export type WhoisLimitVerdict =
  | { ok: true }
  | { ok: false; reason: 'RATE_LIMITED'; retryAfterSeconds: number }
  | { ok: false; reason: 'UNAVAILABLE' }

function retryAfter(resetAt: string | undefined, fallbackSeconds: number): number {
  const ms = resetAt ? Date.parse(resetAt) - Date.now() : NaN
  return Number.isFinite(ms) ? Math.max(1, Math.ceil(ms / 1000)) : fallbackSeconds
}

/** Fails closed: when the counter cannot be reached the lookup is refused. */
export async function checkWhoisLimits(key: string, deps: LimiterDeps): Promise<WhoisLimitVerdict> {
  for (const window of WHOIS_LIMITS) {
    const row = await deps.reserve(`whois:${window.seconds}:${key}`, window.limit, window.seconds)
    if (!row) return { ok: false, reason: 'UNAVAILABLE' }
    if (!row.allowed) {
      return { ok: false, reason: 'RATE_LIMITED', retryAfterSeconds: retryAfter(row.resetAt, window.seconds) }
    }
  }
  return { ok: true }
}
