import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logUserEvent } from '@/lib/notify'
import { metaAdsFeatureEnabled } from '@/lib/ads/meta-route-utils'
import { listMetaConnectionsNearExpiry } from '@/lib/ads/meta-connections'
import {
  META_EXPIRY_WARNING_DAYS,
  buildMetaExpiryMail,
  planMetaExpiryNotices,
} from '@/lib/ads/meta-token-expiry'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!metaAdsFeatureEnabled()) return NextResponse.json({ ok: true, skipped: 'disabled' }, { headers: { 'Cache-Control': 'no-store' } })

  try {
    const admin = createAdminClient()
    const notices = planMetaExpiryNotices(await listMetaConnectionsNearExpiry(admin, META_EXPIRY_WARNING_DAYS))
    let sent = 0
    for (const notice of notices) {
      const { connection } = notice
      if (notice.kind === 'expired' && connection.status === 'active') {
        const { error } = await admin
          .from('ads_connections')
          .update({ status: 'error', refresh_token_enc: null, last_error: 'token_expired' })
          .eq('id', connection.id)
          .eq('user_id', connection.userId)
        if (error) console.error('[meta-ads] expiry state update failed')
      }
      const mail = buildMetaExpiryMail(notice)
      try {
        await logUserEvent({
          userId: connection.userId,
          type: `meta_ads_token_${notice.kind}`,
          subject: mail.subject,
          body: mail.subject,
          userEmail: () => mail,
          dedupeKey: notice.dedupeKey,
        })
        sent += 1
      } catch {
        console.error('[meta-ads] expiry notification failed')
      }
    }
    return NextResponse.json({ ok: true, checked: notices.length, notified: sent }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'expiry_check_failed' }, { status: 503 })
  }
}
