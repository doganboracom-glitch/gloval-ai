import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { SUPPORT_EMAIL } from '@/lib/notify'
import type { EmailLang } from '@/lib/email/lang'
import { buildBillingReminderCopy } from '@/lib/email/billing-reminder-copy'
import type { LifecycleCopy } from '@/lib/email/lifecycle-copy'
import {
  daysLeft,
  isReminderStillApplicable,
  parseBillingReminderKey,
  resolveGraceDays,
  resolveGraceEnd,
  type ReminderSubscription,
} from '@/lib/billing-reminders-core'

// Lands on the billing page's renewal card; no payment URL is ever embedded in an email.
export const BILLING_REMINDER_URL = 'https://gloval.ai/billing?renew=1#renew'

export type BillingReminderPrepared =
  | { type: 'copy'; copy: LifecycleCopy }
  | { type: 'fail'; code: string }
  | { type: 'retry'; code: string }

/**
 * Loads the subscription a queued reminder refers to and builds the email only
 * if it still applies. A customer who renewed since the row was queued gets
 * nothing, instead of a stale "payment failed" mail.
 */
export async function prepareBillingReminder(
  row: { user_id: string; dedupe_key: string | null },
  lang: EmailLang,
  now: Date = new Date(),
): Promise<BillingReminderPrepared> {
  const key = parseBillingReminderKey(row.dedupe_key)
  if (!key) return { type: 'fail', code: 'invalid_reminder_key' }

  const admin = createAdminClient()
  const { data: sub, error } = await admin
    .from('billing_subscriptions')
    .select(
      'id, user_id, status, provider, plan_id, cancel_at_period_end, current_period_end, grace_period_ends_at, suspended_at, suspended_project_ids',
    )
    .eq('id', key.subscriptionId)
    .maybeSingle()
  if (error) return { type: 'retry', code: 'subscription_lookup_failed' }
  if (!sub || sub.user_id !== row.user_id) return { type: 'fail', code: 'subscription_missing' }

  const { data: plan, error: planError } = await admin
    .from('billing_plans')
    .select('name, price_cents, interval')
    .eq('id', sub.plan_id)
    .maybeSingle()
  if (planError) return { type: 'retry', code: 'plan_lookup_failed' }
  if (!plan) return { type: 'fail', code: 'plan_missing' }

  const reminderSub: ReminderSubscription = {
    id: sub.id as string,
    status: sub.status as string,
    provider: (sub.provider as string | null) ?? null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    current_period_end: (sub.current_period_end as string | null) ?? null,
    grace_period_ends_at: (sub.grace_period_ends_at as string | null) ?? null,
    suspended_at: (sub.suspended_at as string | null) ?? null,
    plan: { price_cents: plan.price_cents as number, interval: plan.interval as string },
  }
  const graceDays = resolveGraceDays(process.env.GRACE_PERIOD)
  if (!isReminderStillApplicable(key.kind, key.periodEnd, reminderSub, now, graceDays)) {
    return { type: 'fail', code: 'no_longer_applicable' }
  }

  const suspendedIds = Array.isArray(sub.suspended_project_ids) ? sub.suspended_project_ids : []
  return {
    type: 'copy',
    copy: buildBillingReminderCopy({
      kind: key.kind,
      lang,
      planName: plan.name as string,
      periodEnd: key.periodEnd,
      graceEnd: resolveGraceEnd(reminderSub, graceDays),
      daysLeft: daysLeft(key.periodEnd, now),
      sitesUnpublished: suspendedIds.length > 0,
      billingUrl: BILLING_REMINDER_URL,
      supportEmail: SUPPORT_EMAIL,
    }),
  }
}
