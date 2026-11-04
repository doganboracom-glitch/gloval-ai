import { NextResponse } from 'next/server'
import { processDueEmailEvents } from '@/lib/email-outbox'
import { processContactAcks } from '@/lib/support/contact-ack'
import { processMakerRequestEmails } from '@/lib/maker-requests/outbox'
import { processReferralEmails } from '@/lib/referrals/email-outbox'
import { syncReferralCommissions } from '@/lib/referrals/commission-sync'

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
    const deadlineMs = Date.now() + OUTBOX_BUDGET_MS
    const commissionSync = await syncReferralCommissions()
    console.log(
      `[email-outbox] referral commissions ok=${commissionSync.ok} created=${commissionSync.created} reversed=${commissionSync.reversed} matured=${commissionSync.matured}`,
    )
    const result = await processDueEmailEvents({ deadlineMs })
    console.log(
      `[email-outbox] sweep processed=${result.sent + result.retry + result.failed + result.deferred} sent=${result.sent} retry=${result.retry} failed=${result.failed} deferred=${result.deferred}`,
    )
    const contactAcks = await processContactAcks({ deadlineMs })
    console.log(
      `[email-outbox] contact acks sent=${contactAcks.sent} retry=${contactAcks.retry} gaveUp=${contactAcks.gaveUp} skipped=${contactAcks.skipped}`,
    )
    const makerRequests = await processMakerRequestEmails({ deadlineMs })
    console.log(
      `[email-outbox] maker requests sent=${makerRequests.sent} retry=${makerRequests.retry} gaveUp=${makerRequests.gaveUp} skipped=${makerRequests.skipped}`,
    )
    const referralEmails = await processReferralEmails({ deadlineMs })
    console.log(
      `[email-outbox] referral emails sent=${referralEmails.sent} retry=${referralEmails.retry} deferred=${referralEmails.deferred} gaveUp=${referralEmails.gaveUp}`,
    )
    return NextResponse.json({ ok: true, ...result, contactAcks, makerRequests, referralEmails, commissionSync })
  } catch {
    console.log('[email-outbox] sweep failed: unknown')
    return NextResponse.json({ error: 'email_outbox_failed' }, { status: 500 })
  }
}
