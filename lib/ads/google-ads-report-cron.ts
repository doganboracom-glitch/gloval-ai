import 'server-only'

import { NextResponse } from 'next/server'
import { GoogleAdsReportStorageError, type GoogleAdsReportFrequency } from '@/lib/ads/google-ads-report-store'
import { runGoogleAdsReportSweep } from '@/lib/ads/google-ads-report-mail'

export async function handleGoogleAdsReportCron(request: Request, frequency: GoogleAdsReportFrequency) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const result = await runGoogleAdsReportSweep(frequency, new Date(), new URL(request.url).origin)
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const code = error instanceof GoogleAdsReportStorageError ? 'report_storage_unavailable' : 'report_send_failed'
    return NextResponse.json({ ok: false, error: code }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
