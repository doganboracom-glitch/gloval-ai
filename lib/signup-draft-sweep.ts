import type { SupabaseClient } from '@supabase/supabase-js'
import { DRAFT_CONSUMED_GRACE_MS, DRAFT_TTL_MS } from '@/lib/signup-draft-core'

export const SIGNUP_DRAFT_SWEEP_MAX_ROWS = 5000
const BATCH_SIZE = 1000

/**
 * Daily cron: deletes drafts that are expired (older than the 7-day TTL) or already
 * used (consumed more than the 1-hour grace ago). Returns the number of rows
 * deleted; bounded by a row cap and an optional deadline, leftovers wait a day.
 */
export async function sweepSignupDrafts(
  admin: Pick<SupabaseClient, 'from'>,
  nowMs: number,
  options: { deadlineMs?: number; maxRows?: number } = {},
): Promise<number> {
  const maxRows = Math.min(options.maxRows ?? SIGNUP_DRAFT_SWEEP_MAX_ROWS, SIGNUP_DRAFT_SWEEP_MAX_ROWS)
  const expired = new Date(nowMs).toISOString()
  const tooOld = new Date(nowMs - DRAFT_TTL_MS).toISOString()
  const usedBefore = new Date(nowMs - DRAFT_CONSUMED_GRACE_MS).toISOString()
  const stale = `expires_at.lt.${expired},created_at.lt.${tooOld},consumed_at.lt.${usedBefore}`
  let deleted = 0

  while (deleted < maxRows) {
    if (options.deadlineMs !== undefined && Date.now() >= options.deadlineMs) break

    const { data: batch, error: selectError } = await admin
      .from('signup_drafts')
      .select('id')
      .or(stale)
      .limit(Math.min(BATCH_SIZE, maxRows - deleted))
    if (selectError) throw selectError
    if (!batch || batch.length === 0) break

    const { data: removed, error: deleteError } = await admin
      .from('signup_drafts')
      .delete()
      .in(
        'id',
        batch.map((row) => row.id as string),
      )
      .select('id')
    if (deleteError) throw deleteError
    deleted += removed?.length ?? 0

    if (batch.length < BATCH_SIZE) break
  }
  return deleted
}
