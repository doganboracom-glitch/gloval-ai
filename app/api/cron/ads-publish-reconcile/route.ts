import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyGooglePublishReconciling } from '@/lib/ads/admin-alert'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH_SIZE = 100
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type StalePublishRow = { plan_id: string; publish_request_id: string | null }

function hasValidCronAuthorization(request: Request, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`)
  const provided = Buffer.from(request.headers.get('authorization') ?? '')
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

function parseRows(value: unknown): StalePublishRow[] | null {
  if (!Array.isArray(value)) return null
  const rows: StalePublishRow[] = []

  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    const row = entry as Record<string, unknown>
    if (
      typeof row.plan_id !== 'string' ||
      !UUID_PATTERN.test(row.plan_id) ||
      (row.publish_request_id !== null &&
        (typeof row.publish_request_id !== 'string' || !UUID_PATTERN.test(row.publish_request_id)))
    ) {
      return null
    }
    rows.push({ plan_id: row.plan_id, publish_request_id: row.publish_request_id as string | null })
  }

  return rows
}

export async function GET(request: Request) {
  if (process.env.GOOGLE_ADS_PUBLISH_ENABLED !== '1') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  if (!hasValidCronAuthorization(request, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('ads_reconcile_stale_google_ads_publishes', {
      p_batch: BATCH_SIZE,
    })
    const rows = parseRows(data)
    if (error || !rows) return NextResponse.json({ error: 'reconciliation_failed' }, { status: 500 })

    const notifications = rows.filter((row): row is StalePublishRow & { publish_request_id: string } =>
      Boolean(row.publish_request_id),
    )
    await Promise.all(
      notifications.map((row) =>
        notifyGooglePublishReconciling(row.plan_id, row.publish_request_id, undefined, 'publish_stale_timeout'),
      ),
    )

    return NextResponse.json(
      { ok: true, reconciled: rows.length, notificationsAttempted: notifications.length },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json({ error: 'reconciliation_failed' }, { status: 500 })
  }
}
