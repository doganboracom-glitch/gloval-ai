import { createAdminClient } from '@/lib/supabase/admin'
import { addCalendarMonths, isYearlySwitchTarget, parseRenewalTargetPlanId } from '@/lib/billing-utils'
import { formatTicketNumber, logUserEvent } from '@/lib/notify'
import { buildLifecycleNotice, type LifecycleNoticeKind } from '@/lib/billing-notices'
import type { SubscriptionStatus } from '@/lib/payments'
import { triggerMailAccessSync } from '@/lib/mail/access-trigger'
import { grantPlanCreditsAfterPayment } from '@/lib/plan-credit-instant-store'

const DEFAULT_GRACE_DAYS = 7

function graceDays() {
  const value = Number(process.env.GRACE_PERIOD)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_GRACE_DAYS
}

/**
 * True while the user's subscription is suspended for non-payment. Suspended
 * accounts keep their content but cannot publish or reactivate sites until the
 * payment succeeds. Fails open on lookup errors; the sweep is the source of truth.
 */
export async function isSubscriptionSuspended(userId: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient()
      .from('billing_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'suspended')
      .limit(1)
    if (error) return false
    return (data?.length ?? 0) > 0
  } catch {
    return false
  }
}

/** Days before the grace period ends at which the final warning is sent. */
export const GRACE_WARNING_DAYS = 2

const DAY_MS = 86400000

export type LifecycleOutcome = 'past_due' | 'grace_notice' | 'suspended' | 'sites_unpublished' | 'unchanged' | 'error'

export type LifecycleLogEntry = {
  subscriptionId: string
  userId: string
  previousStatus: string
  newStatus: string
  periodEnd: string | null
  outcome: LifecycleOutcome
  notificationsSent: number
  notificationsDeduped: number
  sitesSuspended: number
}

export type LifecycleSweepResult = {
  /** Subscriptions found with an ended period and a still-open status (active / past_due). */
  detected: number
  markedPastDue: number
  suspended: number
  restored: number
  /** Lifecycle emails actually delivered by this run. */
  notified: number
  /** Lifecycle emails skipped because the same notice was already sent for that period. */
  duplicatesBlocked: number
  /** Sites unpublished by this run (never deleted; remembered for restore on payment). */
  sitesSuspended: number
  entries: LifecycleLogEntry[]
}

type SweepSub = {
  id: string
  user_id: string
  status: string
  current_period_end: string | null
  grace_period_ends_at: string | null
}

/**
 * Reconciles EVERY subscription whose period already ended, including accounts
 * that lapsed long before this code shipped. The stage is derived from the
 * server-side `current_period_end` (grace = period end + grace days), never from
 * "now", so an old lapse is not granted a fresh grace window:
 *  - inside grace   -> past_due (+ payment notice, final warning when close)
 *  - grace elapsed  -> suspended directly (sites unpublished, content kept)
 * Nothing is deleted. Notices are keyed per subscription + period, so re-running
 * the sweep (or overlapping crons) never emails twice and never reprocesses a
 * subscription that is already in its final state.
 */
export async function reconcileSubscriptionLifecycle(now = new Date()): Promise<LifecycleSweepResult> {
  const admin = createAdminClient()
  const result: LifecycleSweepResult = {
    detected: 0,
    markedPastDue: 0,
    suspended: 0,
    restored: 0,
    notified: 0,
    duplicatesBlocked: 0,
    sitesSuspended: 0,
    entries: [],
  }
  const nowIso = now.toISOString()

  const record = (entry: LifecycleLogEntry) => {
    result.entries.push(entry)
    console.log('[billing-lifecycle]', JSON.stringify(entry))
  }

  const deliver = async (kind: LifecycleNoticeKind, sub: SweepSub, graceEndsAt: Date | null, entry: LifecycleLogEntry) => {
    const notice = buildLifecycleNotice(kind, { subscriptionId: sub.id, periodEnd: sub.current_period_end, graceEndsAt })
    try {
      const delivered = await logUserEvent({
        userId: sub.user_id,
        type: notice.type,
        subject: notice.subject,
        body: notice.body,
        dedupeKey: notice.dedupeKey,
      })
      if (delivered) {
        result.notified++
        entry.notificationsSent++
      } else {
        result.duplicatesBlocked++
        entry.notificationsDeduped++
      }
    } catch (error) {
      console.log('[billing-lifecycle] notice failed:', kind, sub.id, error)
    }
  }

  const processExpired = async (sub: SweepSub): Promise<LifecycleLogEntry> => {
    const entry: LifecycleLogEntry = {
      subscriptionId: sub.id,
      userId: sub.user_id,
      previousStatus: sub.status,
      newStatus: sub.status,
      periodEnd: sub.current_period_end,
      outcome: 'unchanged',
      notificationsSent: 0,
      notificationsDeduped: 0,
      sitesSuspended: 0,
    }
    const periodEnd = new Date(sub.current_period_end as string)
    const graceEnd =
      sub.status === 'past_due' && sub.grace_period_ends_at
        ? new Date(sub.grace_period_ends_at)
        : new Date(periodEnd.getTime() + graceDays() * DAY_MS)

    if (graceEnd > now) {
      if (sub.status === 'active') {
        const { data: claimed } = await admin
          .from('billing_subscriptions')
          .update({ status: 'past_due', grace_period_ends_at: graceEnd.toISOString(), suspension_reason: 'renewal_payment_failed' })
          .eq('id', sub.id)
          .eq('status', 'active')
          .select('id')
        if (!claimed?.length) return entry
        result.markedPastDue++
        entry.newStatus = 'past_due'
        entry.outcome = 'past_due'
      } else {
        entry.outcome = 'grace_notice'
      }
      // Also backfills the first notice for past_due rows that never got one.
      await deliver('past_due', sub, graceEnd, entry)
      if (graceEnd.getTime() - now.getTime() <= GRACE_WARNING_DAYS * DAY_MS) {
        await deliver('grace_warning', sub, graceEnd, entry)
      }
      return entry
    }

    // Claim the suspension before touching any site, so a payment that lands
    // concurrently (status flipped back to active) never loses its sites.
    const { data: projects } = await admin.from('projects').select('id').eq('owner_id', sub.user_id).eq('published', true)
    const ids = (projects ?? []).map((project) => project.id)
    const { data: claimed } = await admin
      .from('billing_subscriptions')
      .update({
        status: 'suspended',
        grace_period_ends_at: graceEnd.toISOString(),
        suspended_at: nowIso,
        suspended_project_ids: ids,
        suspension_reason: 'grace_period_expired',
      })
      .eq('id', sub.id)
      .eq('status', sub.status)
      .select('id')
    if (!claimed?.length) return entry
    if (ids.length) await admin.from('projects').update({ published: false, status: 'draft' }).in('id', ids)
    result.suspended++
    result.sitesSuspended += ids.length
    entry.newStatus = 'suspended'
    entry.outcome = 'suspended'
    entry.sitesSuspended = ids.length
    await deliver('suspended', sub, null, entry)
    return entry
  }

  const { data: expired } = await admin
    .from('billing_subscriptions')
    .select('id, user_id, status, current_period_end, grace_period_ends_at')
    .in('status', ['active', 'past_due'])
    .lte('current_period_end', nowIso)

  for (const sub of (expired ?? []) as SweepSub[]) {
    result.detected++
    try {
      const entry = await processExpired(sub)
      record(entry)
      if (entry.outcome === 'past_due' || entry.outcome === 'suspended') {
        await triggerMailAccessSync(sub.user_id, 'subscription_expired')
      }
    } catch (error) {
      console.log('[billing-lifecycle] failed:', sub.id, error)
      record({
        subscriptionId: sub.id,
        userId: sub.user_id,
        previousStatus: sub.status,
        newStatus: sub.status,
        periodEnd: sub.current_period_end,
        outcome: 'error',
        notificationsSent: 0,
        notificationsDeduped: 0,
        sitesSuspended: 0,
      })
    }
  }

  // Safety net: an already-suspended, still-unpaid account must not have live
  // sites (e.g. a suspension interrupted mid-way, or a legacy suspended row).
  const { data: suspendedSubs } = await admin
    .from('billing_subscriptions')
    .select('id, user_id, current_period_end, suspended_project_ids')
    .eq('status', 'suspended')
    .lte('current_period_end', nowIso)

  for (const sub of suspendedSubs ?? []) {
    try {
      const { data: live } = await admin.from('projects').select('id').eq('owner_id', sub.user_id).eq('published', true)
      const liveIds = (live ?? []).map((project) => project.id)
      if (!liveIds.length) continue
      const remembered = Array.isArray(sub.suspended_project_ids)
        ? sub.suspended_project_ids.filter((id: unknown): id is string => typeof id === 'string')
        : []
      const { data: claimed } = await admin
        .from('billing_subscriptions')
        .update({ suspended_project_ids: Array.from(new Set([...remembered, ...liveIds])) })
        .eq('id', sub.id)
        .eq('status', 'suspended')
        .select('id')
      if (!claimed?.length) continue
      await admin.from('projects').update({ published: false, status: 'draft' }).in('id', liveIds)
      result.sitesSuspended += liveIds.length
      record({
        subscriptionId: sub.id,
        userId: sub.user_id,
        previousStatus: 'suspended',
        newStatus: 'suspended',
        periodEnd: sub.current_period_end,
        outcome: 'sites_unpublished',
        notificationsSent: 0,
        notificationsDeduped: 0,
        sitesSuspended: liveIds.length,
      })
    } catch (error) {
      console.log('[billing-lifecycle] suspended cleanup failed:', sub.id, error)
    }
  }

  return result
}

const RENEWABLE_STATUSES = ['trialing', 'active', 'past_due', 'suspended']

export type RenewalCharge = {
  id: string
  subscription_id: string
  user_id: string
  amount_cents: number
  currency: string
  idempotency_key?: string | null
}

export type RenewalOutcome =
  | { kind: 'renewed'; restored: number; skipped: number }
  | { kind: 'duplicate' }
  | { kind: 'rejected'; reason: string }
  | { kind: 'failed_recorded' }
  | { kind: 'ignored' }

type ProjectRow = { id: string; slug: string | null; published: boolean; project_type: string | null; created_at: string | null }

/**
 * Restores the sites remembered by suspension, oldest first, without ever
 * exceeding the owner's effective limits: total = plan limit + active add-ons,
 * and on the e-commerce plan 1 e-commerce site (add-ons never raise it) with the
 * rest corporate. Sites that do not fit stay unpublished.
 */
async function restoreSuspendedSites(userId: string, suspendedIds: string[], planCode: string | null) {
  const admin = createAdminClient()
  const [{ getEffectiveSiteLimit }, { resolveEcommerceSiteLimit }, { toPlanCode }] = await Promise.all([
    import('@/lib/effective-limits'),
    import('@/lib/add-ons'),
    import('@/lib/pricing-config'),
  ])
  const code = toPlanCode(planCode)
  const [{ data: owned }, { data: live }] = await Promise.all([
    admin.from('projects').select('id, slug, published, project_type, created_at').eq('owner_id', userId).in('id', suspendedIds),
    admin.from('projects').select('id, project_type').eq('owner_id', userId).eq('published', true),
  ])

  const limit = await getEffectiveSiteLimit(userId, code)
  const ecommerceLimit = resolveEcommerceSiteLimit(code)
  let total = (live ?? []).length
  let ecommerce = (live ?? []).filter((p) => p.project_type === 'ecommerce').length
  let corporate = total - ecommerce

  const candidates = ((owned ?? []) as ProjectRow[])
    .filter((p) => !p.published)
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))

  const accepted: ProjectRow[] = []
  for (const project of candidates) {
    if (total >= limit) continue
    const isEcommerce = project.project_type === 'ecommerce'
    if (ecommerceLimit > 0) {
      if (isEcommerce ? ecommerce >= ecommerceLimit : corporate >= limit - ecommerceLimit) continue
    }
    accepted.push(project)
    total++
    if (isEcommerce) ecommerce++
    else corporate++
  }

  if (accepted.length) {
    await admin
      .from('projects')
      .update({ published: true, status: 'published' })
      .in('id', accepted.map((p) => p.id))
      .eq('owner_id', userId)
    try {
      const { revalidatePath } = await import('next/cache')
      for (const project of accepted) if (project.slug) revalidatePath(`/site/${project.slug}`)
    } catch {
      // Revalidation is best effort; the sites are already restored.
    }
  }
  return { restored: accepted.length, skipped: candidates.length - accepted.length }
}

/**
 * Settles ONE already-verified subscription renewal payment. Idempotent: the
 * pending `renew_*` ledger row is claimed atomically (pending -> succeeded), so a
 * repeated callback finds nothing to claim and changes/notifies nothing.
 */
export async function settleSubscriptionRenewal(input: {
  providerId: string
  reference: string
  status: 'paid' | 'failed' | 'pending' | string
  paidAmountCents?: number
  paidCurrency?: string
  charge: RenewalCharge
  now?: Date
  /** Admin-recorded settlements only; provider renewals leave both unset. */
  periodMonths?: number
  source?: 'provider' | 'manual' | 'gift'
}): Promise<RenewalOutcome> {
  const admin = createAdminClient()
  const { charge } = input
  const now = input.now ?? new Date()
  const ticket = formatTicketNumber(input.reference)

  if (input.status === 'failed') {
    const { data: claimed } = await admin
      .from('billing_transactions')
      .update({ status: 'failed' })
      .eq('id', charge.id)
      .eq('status', 'pending')
      .select('id')
    if (!claimed?.length) return { kind: 'duplicate' }
    await logUserEvent({
      userId: charge.user_id,
      type: 'payment_failed',
      subject: 'Yenileme ödemesi başarısız',
      body: `Abonelik yenileme ödemesi tamamlanamadı. Faturalandırma sayfasından tekrar deneyebilirsiniz. İşlem No: ${ticket}.`,
      dedupeKey: `renewal:failed:${charge.id}`,
    })
    return { kind: 'failed_recorded' }
  }
  if (input.status !== 'paid') return { kind: 'ignored' }

  const amountMismatch = input.paidAmountCents !== undefined && input.paidAmountCents !== charge.amount_cents
  const currencyMismatch =
    input.paidCurrency !== undefined && input.paidCurrency.replace('TL', 'TRY').toUpperCase() !== String(charge.currency).toUpperCase()
  if (amountMismatch || currencyMismatch) return { kind: 'rejected', reason: 'payment_mismatch' }

  const { data: sub } = await admin
    .from('billing_subscriptions')
    .select('id, user_id, status, plan_id, current_period_end, suspended_project_ids')
    .eq('id', charge.subscription_id)
    .maybeSingle()
  if (!sub || sub.user_id !== charge.user_id || !RENEWABLE_STATUSES.includes(sub.status)) {
    return { kind: 'rejected', reason: 'subscription_not_renewable' }
  }

  // A renewal may carry a monthly -> yearly switch of the same tier. The target
  // is re-validated against the catalog and the charged amount BEFORE the ledger
  // row is claimed, so a bad/forged key can never change the plan.
  const targetPlanId = parseRenewalTargetPlanId(charge.idempotency_key)
  let switchTarget: { id: string; code: string; name: string; interval: string } | null = null
  if (targetPlanId) {
    const { data: current } = await admin
      .from('billing_plans')
      .select('id, code, interval, active, price_cents, currency, product_category')
      .eq('id', sub.plan_id)
      .maybeSingle()
    const { data: target } = await admin
      .from('billing_plans')
      .select('id, code, name, interval, active, price_cents, currency, product_category')
      .eq('id', targetPlanId)
      .maybeSingle()
    if (
      !current ||
      !target ||
      !isYearlySwitchTarget(current, target) ||
      target.price_cents !== charge.amount_cents ||
      String(target.currency).toUpperCase() !== String(charge.currency).toUpperCase()
    ) {
      return { kind: 'rejected', reason: 'invalid_interval_switch' }
    }
    switchTarget = target
  }

  const { data: claimed } = await admin
    .from('billing_transactions')
    .update({ status: 'succeeded' })
    .eq('id', charge.id)
    .eq('status', 'pending')
    .select('id')
  if (!claimed?.length) return { kind: 'duplicate' }

  try {
    const { data: currentPlanRow } = await admin.from('billing_plans').select('code, name, interval').eq('id', sub.plan_id).maybeSingle()
    const plan = switchTarget ?? currentPlanRow
    const previousEnd = sub.current_period_end ? new Date(sub.current_period_end) : null
    const periodExpired = !previousEnd || previousEnd <= now
    const periodStart = periodExpired ? now : (previousEnd as Date)
    const periodEnd =
      input.periodMonths && input.periodMonths > 0
        ? addCalendarMonths(periodStart, input.periodMonths)
        : nextBillingPeriod(periodStart, plan?.interval === 'year' ? 'year' : 'month')
    const suspendedIds = Array.isArray(sub.suspended_project_ids)
      ? sub.suspended_project_ids.filter((id): id is string => typeof id === 'string')
      : []

    // Activate first: add-on capacity only counts for an active subscription.
    await admin
      .from('billing_subscriptions')
      .update({
        status: 'active',
        ...(switchTarget ? { plan_id: switchTarget.id } : {}),
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        grace_period_ends_at: null,
        suspended_at: null,
        suspension_reason: null,
        suspended_project_ids: [],
      })
      .eq('id', sub.id)

    const { restored, skipped } = suspendedIds.length
      ? await restoreSuspendedSites(sub.user_id, suspendedIds, plan?.code ?? null)
      : { restored: 0, skipped: 0 }

    await logUserEvent({
      userId: sub.user_id,
      type: 'payment_succeeded',
  subject: input.source === 'gift' ? 'Aboneliğinize hediye süre tanımlandı' : 'Abonelik yenilendi',
  includeBillingProfileReminder: input.source !== 'gift',
  body:
        (input.source === 'gift'
          ? `Aboneliğinize ${input.periodMonths ?? 1} ay hediye süre tanımlandı${plan ? ` (${plan.name})` : ''}. Yeni dönem sonu: ${periodEnd.toLocaleDateString('tr-TR')}.`
          : input.source === 'manual'
            ? `Ödemeniz (havale/EFT/nakit) onaylandı${plan ? ` (${plan.name})` : ''}. Yeni dönem sonu: ${periodEnd.toLocaleDateString('tr-TR')}.`
            : `Yenileme ödemeniz onaylandı${plan ? ` (${plan.name})` : ''}. Yeni dönem sonu: ${periodEnd.toLocaleDateString('tr-TR')}.`) +
        (restored ? ` ${restored} site yeniden yayına alındı.` : '') +
        (skipped ? ` ${skipped} site paket limitinin dışında kaldığı için yayına alınmadı.` : '') +
        ` İşlem No: ${ticket}.`,
      dedupeKey: `renewal:succeeded:${charge.id}`,
    })
    await triggerMailAccessSync(sub.user_id, 'subscription_renewed')
    grantPlanCreditsAfterPayment(sub.id)
    return { kind: 'renewed', restored, skipped }
  } catch (error) {
    // Hand the ledger row back so a retried callback can finish the renewal.
    await admin.from('billing_transactions').update({ status: 'pending' }).eq('id', charge.id)
    throw error
  }
}

export function nextBillingPeriod(from: Date, interval: 'month' | 'year') {
  return addCalendarMonths(from, interval === 'year' ? 12 : 1)
}

export function isBillingLifecycleStatus(status: SubscriptionStatus) {
  return ['active', 'past_due', 'suspended'].includes(status)
}

export const billingLifecycleStatuses: SubscriptionStatus[] = ['trialing', 'active', 'past_due', 'suspended', 'canceled', 'incomplete']
