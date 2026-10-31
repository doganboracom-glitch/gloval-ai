import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanupExpiredGoogleAdsOAuthFlows } from '@/lib/ads/google-connections'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH_SIZE = 5_000
const MAX_BATCHES = 10

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  let batches = 0
  const totals: Record<string, number> = {}

  try {
    const oauthCleanup = await cleanupExpiredGoogleAdsOAuthFlows(admin)
    for (; batches < MAX_BATCHES; batches += 1) {
      const { data, error } = await admin.rpc('ads_purge_expired', {
        p_free_usage_days: 14,
        p_reservation_days: 7,
        p_anon_hash_days: 30,
        p_usage_days: 400,
        p_alert_days: 90,
        p_batch: BATCH_SIZE,
      })
      if (error || !data || typeof data !== 'object') {
        return NextResponse.json({ error: 'purge_failed' }, { status: 500 })
      }

      const result = data as Record<string, unknown>
      let batchHadMore = false
      for (const [key, value] of Object.entries(result)) {
        if (key === 'batch' || typeof value !== 'number') continue
        totals[key] = (totals[key] ?? 0) + value
        if (value === BATCH_SIZE) batchHadMore = true
      }
      if (!batchHadMore) {
        batches += 1
        break
      }
    }

    return NextResponse.json({ ok: true, batches, purged: totals, oauthCleanup }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'purge_failed' }, { status: 500 })
  }
}
