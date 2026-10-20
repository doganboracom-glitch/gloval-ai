import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Rate limits for the blog admin write paths. Counters live in
 * `rate_limit_counters` (`reserve_rate_limit`, migration 061) under a
 * `blogadm:` prefix. Admins are trusted, so these are generous: they exist to
 * stop a stolen session or a runaway script, not to slow an editor down.
 * When the counter cannot be reached the request is refused (fail closed).
 */

export type BlogLimitKind = 'write' | 'upload' | 'ai'

type Window = { seconds: number; limit: number }

export const BLOG_ADMIN_LIMITS: Record<BlogLimitKind, Window[]> = {
  write: [{ seconds: 60, limit: 60 }],
  upload: [{ seconds: 60, limit: 20 }],
  ai: [
    { seconds: 600, limit: 5 },
    { seconds: 86_400, limit: 30 },
  ],
}

export type ReserveFn = (subject: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; resetAt?: string } | null>

const reserveViaRpc: ReserveFn = async (subject, limit, windowSeconds) => {
  const { data, error } = await createAdminClient()
    .rpc('reserve_rate_limit', { p_subject: subject, p_limit: limit, p_window_seconds: windowSeconds })
    .maybeSingle()
  if (error || !data) {
    console.error('[blog-admin-limit] reserve failed:', error?.message)
    return null
  }
  const row = data as { allowed: boolean; reset_at?: string }
  return { allowed: row.allowed, resetAt: row.reset_at }
}

export type LimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

export async function checkBlogAdminLimit(
  userId: string,
  kind: BlogLimitKind,
  reserve: ReserveFn = reserveViaRpc,
): Promise<LimitResult> {
  for (const window of BLOG_ADMIN_LIMITS[kind]) {
    const row = await reserve(`blogadm:${kind}:${window.seconds}:${userId}`, window.limit, window.seconds)
    if (!row || !row.allowed) {
      const resetMs = row?.resetAt ? Date.parse(row.resetAt) - Date.now() : window.seconds * 1000
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(resetMs / 1000)) }
    }
  }
  return { allowed: true }
}
