import type { SupabaseClient } from '@supabase/supabase-js'

const TABLE = 'rate_limit_counters'

/** Longest window any bucket uses is 24h; a row older than this is expired in every bucket. */
const EXPIRY_MS = 25 * 60 * 60 * 1000
export const RATE_LIMIT_SWEEP_MAX_ROWS = 5000
const BATCH_SIZE = 1000

/**
 * Deletes expired `rate_limit_counters` rows (called by the daily cron).
 * Removing an expired row is equivalent to the window reset `reserve_rate_limit`
 * would perform, so it cannot change any limit decision. Bounded by both a row
 * cap per run and a time budget; leftovers are picked up the next day.
 */
export async function sweepExpiredRateLimitCounters(
  admin: SupabaseClient,
  nowMs: number,
  options: { deadlineMs?: number; maxRows?: number } = {},
): Promise<number> {
  const maxRows = Math.min(options.maxRows ?? RATE_LIMIT_SWEEP_MAX_ROWS, RATE_LIMIT_SWEEP_MAX_ROWS)
  const cutoff = new Date(nowMs - EXPIRY_MS).toISOString()
  let deleted = 0

  while (deleted < maxRows) {
    if (options.deadlineMs !== undefined && Date.now() >= options.deadlineMs) break

    const { data: batch, error: selectError } = await admin
      .from(TABLE)
      .select('subject')
      .lt('window_started_at', cutoff)
      .limit(Math.min(BATCH_SIZE, maxRows - deleted))
    if (selectError) throw selectError
    if (!batch || batch.length === 0) break

    const { data: removed, error: deleteError } = await admin
      .from(TABLE)
      .delete()
      .in(
        'subject',
        batch.map((row) => row.subject as string),
      )
      .lt('window_started_at', cutoff)
      .select('subject')
    if (deleteError) throw deleteError
    deleted += removed?.length ?? 0

    if (batch.length < BATCH_SIZE) break
  }

  return deleted
}
