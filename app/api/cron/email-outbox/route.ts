import { NextResponse } from 'next/server'
import { processDueEmailEvents } from '@/lib/email-outbox'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const OUTBOX_BUDGET_MS = 45_000

/** Inert until CRON_SECRET is set; Vercel Cron (see vercel.json) sends it as a Bearer token. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const result = await processDueEmailEvents({ deadlineMs: Date.now() + OUTBOX_BUDGET_MS })
    console.log(
      `[email-outbox] sweep processed=${result.sent + result.retry + result.failed + result.deferred} sent=${result.sent} retry=${result.retry} failed=${result.failed} deferred=${result.deferred}`,
    )
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.log('[email-outbox] sweep failed:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ error: 'email_outbox_failed' }, { status: 500 })
  }
}
