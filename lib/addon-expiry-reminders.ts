import 'server-only'

import { YEARLY_ADD_ON_CODES } from '@/lib/add-ons'
import {
  ADDON_REMINDER_LOOKAHEAD_DAYS,
  addOnReminderName,
  buildAddOnReminderCopy,
  daysLeft,
  reminderDedupeKey,
  resolveReminderStage,
} from '@/lib/addon-expiry-reminder-core'
import { escape, renderEmailLayout } from '@/lib/email/layout'
import { resolveEmailLang } from '@/lib/email/lang'
import { claimNotification, releaseNotificationClaim, sendTransactionalEmailDetailed } from '@/lib/notify'
import { createAdminClient } from '@/lib/supabase/admin'

const RENEW_URL = 'https://gloval.ai/billing#ek-paketler'
const SWEEP_LIMIT = 500

export type AddOnReminderSweepResult = { scanned: number; sent: number; skipped: number; failed: number }

/**
 * Emails owners of yearly add-ons 30 and 7 days before expiry. Monthly add-ons
 * follow the subscription and are not reminded. Each (grant, stage) is claimed
 * once via `notification_logs.dedupe_key`; a failed send releases the claim so
 * the next cron run retries.
 */
export async function processAddOnExpiryReminders(
  options: { now?: Date; deadlineMs?: number } = {},
): Promise<AddOnReminderSweepResult> {
  const now = options.now ?? new Date()
  const result: AddOnReminderSweepResult = { scanned: 0, sent: 0, skipped: 0, failed: 0 }
  const admin = createAdminClient()
  const horizon = new Date(now.getTime() + ADDON_REMINDER_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000)

  const { data, error } = await admin
    .from('user_addon_entitlements')
    .select('id, user_id, addon_code, expires_at')
    .eq('status', 'active')
    .in('addon_code', [...YEARLY_ADD_ON_CODES])
    .gt('expires_at', now.toISOString())
    .lte('expires_at', horizon.toISOString())
    .order('expires_at', { ascending: true })
    .limit(SWEEP_LIMIT)
  if (error || !data) return result

  for (const row of data) {
    if (options.deadlineMs && Date.now() > options.deadlineMs) break
    result.scanned += 1
    const expiresAt = row.expires_at as string
    const stage = resolveReminderStage(expiresAt, now)
    if (!stage) {
      result.skipped += 1
      continue
    }

    const dedupeKey = reminderDedupeKey(row.id as string, stage)
    const { data: existing } = await admin
      .from('notification_logs')
      .select('id')
      .eq('dedupe_key', dedupeKey)
      .maybeSingle()
    if (existing) {
      result.skipped += 1
      continue
    }

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(row.user_id as string)
    const user = userError ? null : userData.user
    if (!user?.email) {
      result.skipped += 1
      continue
    }
    const meta = user.user_metadata ?? {}
    const lang = resolveEmailLang(meta.language, meta.email_locale)
    const copy = buildAddOnReminderCopy({
      lang,
      addOnName: addOnReminderName(row.addon_code as string, lang),
      expiresAt,
      days: daysLeft(expiresAt, now),
    })

    const claimed = await claimNotification({
      userId: row.user_id as string,
      type: 'addon_expiry_reminder',
      subject: copy.subject,
      body: null,
      dedupeKey,
    })
    if (!claimed) {
      result.skipped += 1
      continue
    }

    const html = renderEmailLayout({
      lang,
      previewText: copy.previewText,
      title: copy.title,
      body: copy.paragraphs.map((p) => `<p style="margin:0 0 14px;">${escape(p)}</p>`).join(''),
      cta: { label: copy.ctaLabel, href: RENEW_URL },
      footer: copy.footer,
    })
    const text = `${copy.title}\n\n${copy.paragraphs.join('\n\n')}\n\n${RENEW_URL}\n\n${copy.footer}`
    const sent = await sendTransactionalEmailDetailed({
      to: user.email,
      subject: copy.subject,
      html,
      text,
      idempotencyKey: dedupeKey,
    })
    if (sent.ok) {
      result.sent += 1
    } else {
      result.failed += 1
      await releaseNotificationClaim(dedupeKey)
    }
  }
  return result
}
