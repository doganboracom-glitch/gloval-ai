import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { removePreviewImages } from '@/lib/ai-preview/storage'

const BATCH = 200
const MAX_BATCHES = 5

/**
 * Cron cleanup for abandoned previews, entirely through the service-role-only
 * database functions: `ai_preview_expire_stale` (TTL and dead `generating`
 * rows), `ai_preview_pending_cleanup` + `ai_preview_mark_cleaned` (storage
 * objects of expired/discarded previews; a row is marked cleaned only after
 * its file was really removed, so failures are retried on the next run) and
 * `ai_preview_purge` (finished rows older than a day). Images of `used`
 * previews are never touched: they are part of the site now.
 */
export async function sweepAiImagePreviews() {
  const admin = createAdminClient()

  const { data: expired, error: expireError } = await admin.rpc('ai_preview_expire_stale')
  if (expireError) throw new Error(`ai_preview_expire_stale: ${expireError.message}`)

  let cleaned = 0
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const { data, error } = await admin.rpc('ai_preview_pending_cleanup', { p_limit: BATCH })
    if (error) throw new Error(`ai_preview_pending_cleanup: ${error.message}`)
    const rows = (data ?? []) as { id: string; storage_path: string }[]
    if (rows.length === 0) break
    const removed = await removePreviewImages(rows.map((r) => r.storage_path))
    if (!removed) break
    const { error: markError } = await admin.rpc('ai_preview_mark_cleaned', { p_ids: rows.map((r) => r.id) })
    if (markError) throw new Error(`ai_preview_mark_cleaned: ${markError.message}`)
    cleaned += rows.length
    if (rows.length < BATCH) break
  }

  const { data: deleted, error: purgeError } = await admin.rpc('ai_preview_purge')
  if (purgeError) throw new Error(`ai_preview_purge: ${purgeError.message}`)

  return { expired: Number(expired ?? 0), cleaned, deleted: Number(deleted ?? 0) }
}
