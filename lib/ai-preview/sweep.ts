import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { removePreviewImages } from '@/lib/ai-preview/storage'

const BATCH = 200
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const STALE_WORK_MS = 10 * 60 * 1000

/**
 * Cron cleanup for abandoned previews: expires rows past their TTL (and dead
 * `generating` ones), deletes their storage objects, and drops finished rows
 * older than a day. Images of `used` previews are never touched: they are part
 * of the site now.
 */
export async function sweepAiImagePreviews(now = Date.now()) {
  const admin = createAdminClient()
  const iso = (ms: number) => new Date(ms).toISOString()
  const table = () => admin.from('ai_image_previews')

  await table().update({ status: 'expired', updated_at: iso(now) }).in('status', ['open', 'generating', 'regenerating']).lt('expires_at', iso(now))
  await table().update({ status: 'expired', updated_at: iso(now) }).eq('status', 'generating').lt('updated_at', iso(now - STALE_WORK_MS))

  const { data } = await table()
    .select('id, storage_path')
    .in('status', ['expired', 'discarded'])
    .not('storage_path', 'is', null)
    .limit(BATCH)
  const rows = (data ?? []) as { id: string; storage_path: string }[]
  if (rows.length > 0) {
    await removePreviewImages(rows.map((r) => r.storage_path))
    await table().update({ storage_path: null }).in('id', rows.map((r) => r.id))
  }

  const { count } = await table()
    .delete({ count: 'exact' })
    .in('status', ['expired', 'discarded', 'used'])
    .lt('updated_at', iso(now - ONE_DAY_MS))

  return { cleaned: rows.length, deleted: count ?? 0 }
}
