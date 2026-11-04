import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/mail/admin-guard'

const STALE_PUBLISH_AFTER_MS = 10 * 60 * 1000
const MAX_STUCK_PUBLISHES = 100

export type StuckGoogleAdsPublish = {
  id: string
  user_id: string
  status: 'publishing' | 'reconciling'
  publish_request_id: string | null
  publish_started_at: string
  failure_reason: string | null
}

export type StuckGoogleAdsPublishList = {
  enabled: boolean
  error: boolean
  rows: StuckGoogleAdsPublish[]
}

export async function listStuckGoogleAdsPublishes(): Promise<StuckGoogleAdsPublishList> {
  await requireAdmin()

  if (process.env.GOOGLE_ADS_PUBLISH_ENABLED !== '1') {
    return { enabled: false, error: false, rows: [] }
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - STALE_PUBLISH_AFTER_MS).toISOString()
  const { data, error } = await admin
    .from('ads_plans')
    .select('id,user_id,status,publish_request_id,publish_started_at,failure_reason')
    .in('status', ['publishing', 'reconciling'])
    .lt('publish_started_at', cutoff)
    .order('publish_started_at', { ascending: true })
    .limit(MAX_STUCK_PUBLISHES)

  if (error) return { enabled: true, error: true, rows: [] }
  return { enabled: true, error: false, rows: (data ?? []) as StuckGoogleAdsPublish[] }
}
