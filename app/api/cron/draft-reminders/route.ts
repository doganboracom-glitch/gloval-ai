import { NextResponse } from 'next/server'
import { resolveDraftReminderConfig } from '@/lib/draft-reminders/core'
import { runDraftRemindersCron } from '@/lib/draft-reminders/run'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const NO_STORE = { 'Cache-Control': 'no-store' }

// Only our own snake_case error codes (e.g. "profiles_query_failed") are surfaced, never free-form messages.
const ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/

function failureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return ERROR_CODE.test(message) ? message : 'unknown_error'
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const config = resolveDraftReminderConfig()
  if (!config.enabled) return NextResponse.json({ ok: true, skipped: 'disabled' }, { headers: NO_STORE })

  try {
    const summary = await runDraftRemindersCron(config)
    console.warn(
      `[draft-reminders] done dryRun=${config.dryRun} scanned=${summary.scanned} attempted=${summary.attempted} sent=${summary.sent} failed=${summary.failed} dryRunRecorded=${summary.dryRunRecorded} duplicates=${summary.duplicates} errors=${summary.errors}`,
    )
    return NextResponse.json({ ok: true, dryRun: config.dryRun, ...summary }, { headers: NO_STORE })
  } catch (error) {
    const reason = failureReason(error)
    console.warn(`[draft-reminders] run failed: ${reason}`)
    return NextResponse.json({ error: 'draft_reminders_failed', reason }, { status: 503, headers: NO_STORE })
  }
}
