import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueBillingReminderEmail } from '@/lib/email-outbox'
import {
  DAY_MS,
  billingReminderDedupeKey,
  resolveDueReminder,
  resolveGraceDays,
  type ReminderSubscription,
} from '@/lib/billing-reminders-core'

const SCAN_LIMIT = 1000
/** Active subscriptions are only looked at once their period ends within this window. */
const LOOKAHEAD_DAYS = 7

export type BillingReminderSweepResult = {
  scanned: number
  queued: number
  duplicates: number
  failed: number
}

type SubRow = {
  id: string
  user_id: string | null
  status: string
  provider: string | null
  plan_id: string
  cancel_at_period_end: boolean | null
  current_period_end: string | null
  grace_period_ends_at: string | null
  suspended_at: string | null
}

const COLUMNS =
  'id, user_id, status, provider, plan_id, cancel_at_period_end, current_period_end, grace_period_ends_at, suspended_at'

/**
 * Queues the reminder each billed subscription is due for right now into the
 * email outbox (delivered by the same cron run). Idempotent: the dedupe key is
 * subscription + billing period + reminder kind, so reruns and overlapping
 * crons never queue the same mail twice. Delivery happens in `email-outbox`.
 */
export async function enqueueBillingReminders(now: Date = new Date()): Promise<BillingReminderSweepResult> {
  const admin = createAdminClient()
  const result: BillingReminderSweepResult = { scanned: 0, queued: 0, duplicates: 0, failed: 0 }
  const graceDays = resolveGraceDays(process.env.GRACE_PERIOD)
  const horizon = new Date(now.getTime() + LOOKAHEAD_DAYS * DAY_MS).toISOString()

  const [active, open] = await Promise.all([
    admin
      .from('billing_subscriptions')
      .select(COLUMNS)
      .eq('status', 'active')
      .not('user_id', 'is', null)
      .not('current_period_end', 'is', null)
      .lte('current_period_end', horizon)
      .limit(SCAN_LIMIT),
    admin
      .from('billing_subscriptions')
      .select(COLUMNS)
      .in('status', ['past_due', 'suspended'])
      .not('user_id', 'is', null)
      .not('current_period_end', 'is', null)
      .limit(SCAN_LIMIT),
  ])
  if (active.error) throw active.error
  if (open.error) throw open.error

  const subs = [...((active.data ?? []) as SubRow[]), ...((open.data ?? []) as SubRow[])]
  if (!subs.length) return result

  const planIds = Array.from(new Set(subs.map((sub) => sub.plan_id)))
  const { data: plans, error: plansError } = await admin
    .from('billing_plans')
    .select('id, price_cents, interval')
    .in('id', planIds)
  if (plansError) throw plansError
  const planById = new Map(
    (plans ?? []).map((plan) => [plan.id as string, { price_cents: plan.price_cents as number, interval: plan.interval as string }]),
  )

  for (const sub of subs) {
    result.scanned++
    if (!sub.user_id) continue
    const reminderSub: ReminderSubscription = {
      id: sub.id,
      status: sub.status,
      provider: sub.provider,
      cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      current_period_end: sub.current_period_end,
      grace_period_ends_at: sub.grace_period_ends_at,
      suspended_at: sub.suspended_at,
      plan: planById.get(sub.plan_id) ?? null,
    }
    const due = resolveDueReminder(reminderSub, now, graceDays)
    if (!due) continue

    const queued = await enqueueBillingReminderEmail({
      userId: sub.user_id,
      kind: due.kind,
      dedupeKey: billingReminderDedupeKey(sub.id, due.periodEnd, due.kind),
    })
    if (queued === 'queued') result.queued++
    else if (queued === 'duplicate') result.duplicates++
    else result.failed++
  }

  return result
}
