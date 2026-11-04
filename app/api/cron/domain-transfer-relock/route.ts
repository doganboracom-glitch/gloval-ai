import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isTransferLockChangeEnabled } from '@/lib/custom-domains/registrar/capabilities'
import {
  runDueTransferWindowRelocks,
  sendDueTransferWindowReminders,
} from '@/lib/custom-domains/registrar/transfer-window-relock'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!isTransferLockChangeEnabled()) return new Response(null, { status: 204 })

  const admin = createAdminClient()
  let reminders = { sent: 0, failed: 0, skipped: 0 }
  try {
    reminders = await sendDueTransferWindowReminders(admin)
  } catch {
    reminders = { sent: 0, failed: 1, skipped: 0 }
  }

  let relocks = {
    claimed: 0,
    relocked: 0,
    deferred: 0,
    cancelled: 0,
    failed: 0,
    retried: 0,
    storageUnavailable: false,
  }
  try {
    relocks = await runDueTransferWindowRelocks(admin)
  } catch {
    relocks = {
      claimed: 0,
      relocked: 0,
      deferred: 0,
      cancelled: 0,
      failed: 0,
      retried: 0,
      storageUnavailable: true,
    }
  }

  return NextResponse.json({ ok: true, reminders, relocks })
}
