import { NextResponse } from 'next/server'
import { resolveDraftReminderConfig } from '@/lib/draft-reminders/core'
import { runDraftRemindersCron } from '@/lib/draft-reminders/run'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const NO_STORE = { 'Cache-Control': 'no-store' }

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
    return NextResponse.json({ ok: true, dryRun: config.dryRun, ...summary }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'draft_reminders_failed' }, { status: 503, headers: NO_STORE })
  }
}
