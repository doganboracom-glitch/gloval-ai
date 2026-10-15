/**
 * Sends the Free/Starter version-prune notice. DRY RUN by default: it lists
 * counts only and sends nothing. A real send needs the explicit --send flag.
 *
 *   set -a && source /vercel/share/.env.project && set +a
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/send-version-prune-notice.ts
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/send-version-prune-notice.ts --send [--per-minute=30] [--limit=N]
 *
 * Each owner is claimed in notification_logs under a unique dedupe_key BEFORE
 * the e-mail goes out, so re-running never e-mails the same owner twice. A
 * failed send releases the claim so a later run can retry that owner.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { claimNotification, releaseNotificationClaim } from '@/lib/notify'
import { sendVersionPruneNotice } from '@/lib/email/version-prune-notice'
import { loadPruneAudience } from '@/lib/prune-notice-audience'
import { NOTICE_TYPE, countByPlan, createPacer, noticeDedupeKey } from '@/lib/prune-notice-audience-core'

function numberFlag(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

async function main() {
  const send = process.argv.includes('--send')
  const perMinute = Math.min(120, numberFlag('per-minute', 30))
  const limit = numberFlag('limit', Number.POSITIVE_INFINITY)

  const owners = await loadPruneAudience()
  const counts = countByPlan(owners)
  console.log(`FREE: ${counts.FREE}  STARTER: ${counts.STARTER}  total: ${owners.size}`)

  if (!send) {
    console.log('Dry run: nothing sent. Pass --send to deliver (rate limited, once per owner).')
    return
  }

  const admin = createAdminClient()
  const pace = createPacer(Math.ceil(60_000 / perMinute), Date.now, (ms) => new Promise((r) => setTimeout(r, ms)))
  const tally = { sent: 0, skippedAlreadySent: 0, failed: 0, noEmail: 0 }
  let processed = 0

  for (const [userId, { plan }] of owners) {
    if (processed >= limit) break
    const { data } = await admin.auth.admin.getUserById(userId)
    const email = data.user?.email
    if (!email) {
      tally.noEmail += 1
      continue
    }

    const dedupeKey = noticeDedupeKey(userId)
    const claimed = await claimNotification({
      userId,
      type: `${NOTICE_TYPE}_claim`,
      subject: 'version prune notice claim',
      body: null,
      dedupeKey,
    })
    if (!claimed) {
      tally.skippedAlreadySent += 1
      continue
    }

    processed += 1
    await pace()
    const lang = data.user?.user_metadata?.locale === 'en' ? 'en' : 'tr'
    const ok = await sendVersionPruneNotice({ userId, to: email, lang, planName: plan }).catch(() => false)
    if (ok) {
      tally.sent += 1
    } else {
      tally.failed += 1
      await releaseNotificationClaim(dedupeKey)
    }
  }

  console.log(tally)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
