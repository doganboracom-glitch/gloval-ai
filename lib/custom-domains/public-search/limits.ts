import { createHash } from 'node:crypto'

/**
 * Abuse limits for the public domain search, on the shared `reserve_rate_limit`
 * counters (no schema change). A denied reservation does not consume budget, so
 * a refused caller cannot dig deeper into the counter.
 *
 * Besides the per-window budgets, every "violation" (rejected input or a
 * budget overrun) is recorded on a separate strike counter. Once an identity
 * reaches `STRIKE_WINDOW.limit` strikes it is refused outright until that
 * window ends. The strike counter is checked by reserve + release, i.e. a peek.
 */

export type Window = { seconds: number; limit: number }

export const PUBLIC_SEARCH_LIMITS: Record<'anon' | 'user', Window[]> = {
  anon: [
    { seconds: 60, limit: 10 },
    { seconds: 3600, limit: 120 },
  ],
  user: [
    { seconds: 60, limit: 15 },
    { seconds: 3600, limit: 180 },
  ],
}

export const STRIKE_WINDOW: Window = { seconds: 600, limit: 8 }

export type ReserveFn = (
  subject: string,
  limit: number,
  windowSeconds: number,
) => Promise<{ allowed: boolean; resetAt?: string } | null>
export type ReleaseFn = (subject: string) => Promise<void>
export type LimiterDeps = { reserve: ReserveFn; release: ReleaseFn }

export const rpcLimiter: LimiterDeps = {
  async reserve(subject, limit, windowSeconds) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { data, error } = await createAdminClient()
        .rpc('reserve_rate_limit', { p_subject: subject, p_limit: limit, p_window_seconds: windowSeconds })
        .maybeSingle()
      if (error || !data) {
        console.error('[domain-search] rate limit reserve failed:', error?.message)
        return null
      }
      const row = data as { allowed: boolean; reset_at?: string }
      return { allowed: row.allowed, resetAt: row.reset_at }
    } catch (error) {
      console.error('[domain-search] rate limit unreachable:', error instanceof Error ? error.name : 'unknown')
      return null
    }
  },
  async release(subject) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      await createAdminClient().rpc('release_rate_limit', { p_subject: subject })
    } catch {
      // A missed release only makes the strike counter slightly stricter.
    }
  },
}

/** `cf-connecting-ip` -> `x-real-ip` -> first `x-vercel-forwarded-for`; null when nothing usable. */
export function resolveRateLimitIp(get: (name: string) => string | null): string | null {
  for (const name of ['cf-connecting-ip', 'x-real-ip', 'x-vercel-forwarded-for']) {
    const first = get(name)?.split(',')[0]?.trim().toLowerCase()
    if (first && first.length <= 45 && /^[0-9a-f:.]+$/.test(first)) return first
  }
  return null
}

export type Identity = { kind: 'user' | 'anon'; key: string }

/** Raw IPs and ids are never stored as-is; the subject only carries a short digest. */
export function identityFor(userId: string | null, ip: string | null): Identity {
  if (userId) return { kind: 'user', key: `user:${digest(userId)}` }
  return { kind: 'anon', key: `ip:${digest(ip ?? 'unknown')}` }
}

function digest(value: string): string {
  return createHash('sha256').update(`domsearch:${value}`).digest('hex').slice(0, 32)
}

export type LimitVerdict =
  | { ok: true }
  | { ok: false; reason: 'RATE_LIMITED'; retryAfterSeconds: number }
  | { ok: false; reason: 'UNAVAILABLE' }

function retryAfter(resetAt: string | undefined, fallbackSeconds: number): number {
  const ms = resetAt ? Date.parse(resetAt) - Date.now() : fallbackSeconds * 1000
  return Math.max(1, Math.ceil((Number.isFinite(ms) ? ms : fallbackSeconds * 1000) / 1000))
}

const strikeSubject = (id: Identity) => `domsearch:strike:${id.key}`

/** True blocks the caller. Counter failure refuses the request. */
export async function checkBlocked(id: Identity, deps: LimiterDeps): Promise<LimitVerdict> {
  const subject = strikeSubject(id)
  const row = await deps.reserve(subject, STRIKE_WINDOW.limit, STRIKE_WINDOW.seconds)
  if (!row) return { ok: false, reason: 'UNAVAILABLE' }
  if (!row.allowed) {
    return { ok: false, reason: 'RATE_LIMITED', retryAfterSeconds: retryAfter(row.resetAt, STRIKE_WINDOW.seconds) }
  }
  await deps.release(subject)
  return { ok: true }
}

export async function recordStrike(id: Identity, deps: LimiterDeps): Promise<void> {
  await deps.reserve(strikeSubject(id), STRIKE_WINDOW.limit, STRIKE_WINDOW.seconds)
}

export async function checkSearchLimits(id: Identity, deps: LimiterDeps): Promise<LimitVerdict> {
  for (const window of PUBLIC_SEARCH_LIMITS[id.kind]) {
    const row = await deps.reserve(`domsearch:${window.seconds}:${id.key}`, window.limit, window.seconds)
    if (!row) return { ok: false, reason: 'UNAVAILABLE' }
    if (!row.allowed) {
      return { ok: false, reason: 'RATE_LIMITED', retryAfterSeconds: retryAfter(row.resetAt, window.seconds) }
    }
  }
  return { ok: true }
}
