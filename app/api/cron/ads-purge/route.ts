import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCronRequest } from '@/lib/ads/cron-auth'
import { purgeExpiredGoogleAdsOAuthFlows } from '@/lib/ads/google-ads-oauth-server'

export const runtime = 'nodejs'
export const maxDuration = 300

const ADS_PURGE_BATCH = 5000
const MAX_ADS_PURGE_BATCHES = 10

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'cron_not_configured' }, { status: 503 })
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), cronSecret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const googleOAuth = await purgeExpiredGoogleAdsOAuthFlows(admin)
    const adsCounts: Record<string, number> = {}
    let pendingAdsRows = false

    for (let batchNumber = 0; batchNumber < MAX_ADS_PURGE_BATCHES; batchNumber += 1) {
      const { data, error } = await admin.rpc('ads_purge_expired', { p_batch: ADS_PURGE_BATCH })
      if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Ads retention RPC failed')
      }

      const batchResult = data as Record<string, unknown>
      const hasFullBatch = Object.entries(batchResult).some(
        ([key, value]) => key !== 'batch' && typeof value === 'number' && value >= ADS_PURGE_BATCH,
      )
      for (const [key, value] of Object.entries(batchResult)) {
        if (key !== 'batch' && typeof value === 'number') adsCounts[key] = (adsCounts[key] ?? 0) + value
      }

      if (!hasFullBatch) break
      if (batchNumber === MAX_ADS_PURGE_BATCHES - 1) pendingAdsRows = true
    }

    return NextResponse.json({ ok: true, googleOAuth, ads: adsCounts, pendingAdsRows })
  } catch {
    console.error('[ads-purge] scheduled cleanup failed')
    return NextResponse.json({ error: 'purge_failed' }, { status: 503 })
  }
}
