'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatTicketNumber, logUserEvent } from '@/lib/notify'
import {
  getPlatformPaymentProvider,
  getPlatformPaymentProviderId,
  type PaymentProviderId,
  type SubscriptionStatus,
} from '@/lib/payments'
import { toSafeFailureCode } from '@/lib/payments/failure-code'
import {
  subscriptionStatusLabelTr,
  addCalendarMonths,
  isActivePeriodOver,
  isYearlySwitchTarget,
  RENEWAL_TARGET_MARKER,
} from '@/lib/billing-utils'

/** Buyer info collected by the pre-purchase legal gate (CheckoutConfirmDialog),
 * forwarded to whichever real PSP needs it (iyzico's Checkout Form requires
 * name/phone/address/identity for every buyer). */
export type CheckoutBuyer = {
  fullName: string
  phone: string
  address: string
  taxId?: string
}

/** Best-effort client IP for PSPs that require one (e.g. iyzico's buyer.ip). */
async function resolveClientIp(): Promise<string> {
  try {
    const h = await headers()
    const fwd = h.get('x-forwarded-for')
    if (fwd) return fwd.split(',')[0].trim()
    const real = h.get('x-real-ip')
    if (real) return real.trim()
  } catch {
    // ignore — headers() is unavailable outside a request context
  }
  return '127.0.0.1'
}

/**
 * SaaS billing domain module (the platform's own subscription billing).
 *
 * This is deliberately separate from the e-commerce order flow in `lib/store.ts`:
 * that flow is shoppers paying store owners, while this is store owners paying
 * the platform. Reads are scoped to the authenticated user (owner) by both an
 * explicit user_id filter and RLS. Mutations run through the service-role admin
 * client only AFTER server-side validation, mirroring the order-creation path.
 */

export type BillingInterval = 'month' | 'year' | 'once'

export type ProductCategory = 'corporate' | 'ecommerce' | 'addon'

export type PlanRow = {
  id: string
  code: string
  name: string
  description: string | null
  price_cents: number
  currency: string
  interval: BillingInterval
  trial_days: number
  features: string[]
  provider_price_id: string | null
  product_category: ProductCategory | null
  active: boolean
  sort_order: number
}

export type EntitlementRow = {
  id: string
  user_id: string
  code: string
  name: string
  kind: 'one_time' | 'recurring'
  status: 'inactive' | 'active' | 'revoked'
  granted_at: string | null
}

export type SubscriptionRow = {
  id: string
  user_id: string
  plan_id: string
  status: SubscriptionStatus
  provider: PaymentProviderId
  provider_ref: string | null
  current_period_start: string
  current_period_end: string | null
  grace_period_ends_at?: string | null
  suspended_at?: string | null
  suspension_reason?: string | null
  suspended_project_ids?: string[]
  trial_ends_at: string | null
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
  // A pending paid upgrade in flight for THIS row: the plan it will become and
  // the payment intent reference to match against on settlement. Both null
  // when there is no upgrade awaiting payment. See `changePlan`.
  pending_plan_id: string | null
  pending_change_ref: string | null
  /**
   * Server-derived, never stored: true when `status` is still `active` but the
   * paid period has already ended (renewal not yet settled). Uses the same rule
   * as add-on purchase verification so the two never contradict each other.
   */
  period_expired?: boolean
}

export type TransactionRow = {
  id: string
  subscription_id: string | null
  user_id: string
  kind: 'charge' | 'proration_credit' | 'proration_debit' | 'refund'
  amount_cents: number
  currency: string
  status: 'pending' | 'succeeded' | 'failed'
  provider: string
  description: string | null
  created_at: string
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHENTICATED')
  return { supabase, userId: user.id, email: user.email ?? '' }
}

/** Public catalog of active plans, ordered for display. */
export async function getPlans(): Promise<PlanRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('billing_plans')
    .select(
      'id, code, name, description, price_cents, currency, interval, trial_days, features, provider_price_id, product_category, active, sort_order',
    )
    .eq('active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as PlanRow[]
}

async function getPlanById(planId: string): Promise<PlanRow | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('billing_plans')
    .select(
      'id, code, name, description, price_cents, currency, interval, trial_days, features, provider_price_id, product_category, active, sort_order',
    )
    .eq('id', planId)
    .maybeSingle()
  if (error) throw error
  return (data as PlanRow) ?? null
}

/** The current user's active (or most recent) subscription, if any. */
export async function getMySubscription(): Promise<SubscriptionRow | null> {
  const { supabase, userId } = await requireUser()
  const { data, error } = await supabase
    .from('billing_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['trialing', 'active', 'past_due', 'suspended'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as SubscriptionRow
  return {
    ...row,
    period_expired: isActivePeriodOver(row.status, row.current_period_end),
  }
}

/** The current user's billing ledger, newest first. */
export async function getMyTransactions(): Promise<TransactionRow[]> {
  const { supabase, userId } = await requireUser()
  const { data, error } = await supabase
    .from('billing_transactions')
    .select(
      'id, subscription_id, user_id, kind, amount_cents, currency, status, provider, description, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as TransactionRow[]
}

// Calendar-month-safe: 'year' is 12 calendar months, not a fixed 365*24h, so
// this also self-corrects the annual case (e.g. Feb 29 -> Feb 28 on a
// non-leap year) via the same end-of-month clamping. See addCalendarMonths.
function addInterval(from: Date, interval: BillingInterval): Date {
  return addCalendarMonths(from, interval === 'year' ? 12 : 1)
}

/**
 * Compute the remaining, unused value of the current plan as a credit and the
 * cost of the new plan for the rest of the period. Positive net => amount owed
 * now; negative net => credit to the customer. All math is done server-side
 * from stored plan prices, never trusting client input.
 */
function computeProration(params: {
  currentPriceCents: number
  newPriceCents: number
  periodStart: Date
  periodEnd: Date
  now: Date
}): { creditCents: number; debitCents: number; netCents: number } {
  const { currentPriceCents, newPriceCents, periodStart, periodEnd, now } =
    params
  const totalMs = Math.max(1, periodEnd.getTime() - periodStart.getTime())
  const remainingMs = Math.max(
    0,
    Math.min(totalMs, periodEnd.getTime() - now.getTime()),
  )
  const fraction = remainingMs / totalMs
  const creditCents = Math.round(currentPriceCents * fraction)
  const debitCents = Math.round(newPriceCents * fraction)
  return { creditCents, debitCents, netCents: debitCents - creditCents }
}

export type SubscribeResult =
  | { ok: true; status: SubscriptionStatus; redirectUrl?: string }
  | { ok: false; error: string; detail?: string }

/**
 * Start a subscription to a plan. Free plans and plans with a trial activate
 * immediately (trialing/active). Paid plans without a trial are settled through
 * the configured payment provider (mock settles synchronously; real providers
 * return a redirect URL).
 */
export async function subscribeToPlan(
  planId: string,
  buyer?: CheckoutBuyer,
): Promise<SubscribeResult> {
  const { userId, email } = await requireUser()
  const plan = await getPlanById(planId)
  if (!plan || !plan.active) return { ok: false, error: 'plan_not_found' }

  const admin = createAdminClient()
  const now = new Date()

  // Enforce a single LIVE subscription per user. 'incomplete' is intentionally
  // excluded: it marks an abandoned redirect-payment attempt, not a real
  // subscription, so it must not lock the user out of trying again.
  const { data: existing } = await admin
    .from('billing_subscriptions')
    .select('id, status')
    .eq('user_id', userId)
    .in('status', ['trialing', 'active', 'past_due', 'suspended'])
    .maybeSingle()
  if (existing) {
    return { ok: false, error: 'already_subscribed' }
  }

  // `uniq_billing_sub_active_user` (a partial unique index on
  // billing_subscriptions.user_id) enforces AT THE DB LEVEL that a user can
  // have at most one non-terminal row at a time — trialing/active/past_due
  // AND incomplete are all included. So we cannot simply insert a fresh row
  // whenever an 'incomplete' one already exists; that unconditionally throws
  // a 23505 duplicate-key error (this crashed the whole billing page for a
  // real user: they clicked "Subscribe" a second time — e.g. a double-click,
  // a second tab, or retrying after the first attempt appeared stuck — while
  // their first 'incomplete' row was still outstanding).
  //
  // A fresh 'incomplete' row already has a live provider_ref/token at the
  // PSP (e.g. the buyer is mid-checkout on iyzico's hosted page). Silently
  // deleting it out from under that in-flight payment — which is what this
  // code used to do unconditionally on every call — orphans it: the async
  // callback later settles by looking up provider_ref, finds no row, and the
  // subscription silently never activates even though the buyer was charged.
  //
  // So: only reclaim an 'incomplete' row once it's old enough to be
  // genuinely abandoned (no realistic in-flight checkout stays open this
  // long). If a fresh one still exists, refuse the new attempt with a
  // friendly, handled result instead of letting the insert crash.
  const staleCutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
  const { data: freshIncomplete } = await admin
    .from('billing_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'incomplete')
    .gte('created_at', staleCutoff)
    .maybeSingle()
  if (freshIncomplete) {
    return { ok: false, error: 'payment_pending' }
  }

  await admin
    .from('billing_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('status', 'incomplete')
    .lt('created_at', staleCutoff)

  const isFree = plan.price_cents === 0
  const hasTrial = plan.trial_days > 0

  const providerId = getPlatformPaymentProviderId()
  const provider = getPlatformPaymentProvider()
  // Redirect-based PSPs (PayTR) settle asynchronously via webhook; the mock
  // provider settles synchronously so dev/preview keeps working end to end.
  const settlesAsync = !isFree && !hasTrial && !provider.capabilities.synchronous

  const periodStart = now
  const trialEnds = hasTrial
    ? new Date(now.getTime() + plan.trial_days * MS_PER_DAY)
    : null
  const periodEnd = hasTrial ? trialEnds : addInterval(now, plan.interval)

  // Initial subscription status:
  // - free           -> active immediately
  // - trial          -> trialing immediately
  // - paid + async    -> incomplete (activated only after a verified callback)
  // - paid + sync      -> active immediately (mock)
  const status: SubscriptionStatus = isFree
    ? 'active'
    : hasTrial
      ? 'trialing'
      : settlesAsync
        ? 'incomplete'
        : 'active'

  const { data: sub, error: subErr } = await admin
    .from('billing_subscriptions')
    .insert({
      user_id: userId,
      plan_id: plan.id,
      status,
      provider: providerId,
      provider_ref: null,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd ? periodEnd.toISOString() : null,
      trial_ends_at: trialEnds ? trialEnds.toISOString() : null,
    })
    .select('id')
    .single()
  if (subErr) throw subErr

  let redirectUrl: string | undefined
  let initialPaymentReference: string | undefined
  let paymentPending = false

  if (!isFree && !hasTrial) {
    // Create a one-off charge for the first period. (Recurring auto-renewal via
    // the PSP's stored-card API is intentionally out of scope for now.)
    //
    // Everything from here is wrapped so a PSP-side failure (missing
    // credentials, a rejected initialize call, an unexpected response shape,
    // etc.) can never escape as an unhandled exception. Left unguarded, that
    // exception would blow past the client's `await subscribeToPlan(...)`
    // with no return value: the caller's code that navigates the
    // already-opened payment popup to `redirectUrl` never runs, so the popup
    // is stuck on the initial `about:blank` it was opened with — exactly the
    // white-screen symptom this fixes. The `incomplete` row inserted above
    // must also be rolled back here, or it becomes an orphaned row that blocks
    // every retry with `payment_pending` even though no payment was ever
    // started.
    try {
      const intent = await provider.createIntent({
        orderId: `sub_${sub.id}`,
        amountCents: plan.price_cents,
        currency: plan.currency,
        customerEmail: email,
        returnUrl: '/billing',
        publicConfig: buyer
          ? {
              buyer: {
                fullName: buyer.fullName,
                phone: buyer.phone,
                address: buyer.address,
                identityNumber: buyer.taxId,
                ip: await resolveClientIp(),
              },
            }
          : undefined,
      })

      initialPaymentReference = intent.reference

      console.log('[v0] subscribeToPlan: intent created, persisting provider_ref', {
        providerId,
        subscriptionId: sub.id,
        refMasked:
          intent.reference.length > 10
            ? `${intent.reference.slice(0, 6)}...${intent.reference.slice(-4)}`
            : `${intent.reference.slice(0, 3)}***`,
        redirectAction: intent.action,
      })

      // Persist the provider reference so the webhook can match the callback back
      // to THIS subscription.
      await admin
        .from('billing_subscriptions')
        .update({ provider_ref: intent.reference })
        .eq('id', sub.id)

      if (settlesAsync && intent.action === 'redirect') {
        paymentPending = true
        // Ledger row stays 'pending' until the callback confirms payment.
        await admin.from('billing_transactions').insert({
          subscription_id: sub.id,
          user_id: userId,
          kind: 'charge',
          amount_cents: plan.price_cents,
          currency: plan.currency,
          status: 'pending',
          provider: providerId,
          provider_ref: intent.reference,
          idempotency_key: `sub_${sub.id}_initial`,
          description: `${plan.name} aboneliği`,
        })
        redirectUrl = intent.redirectUrl
      } else {
        // Synchronous settlement (mock): record the successful charge now.
        await admin.from('billing_transactions').insert({
          subscription_id: sub.id,
          user_id: userId,
          kind: 'charge',
          amount_cents: plan.price_cents,
          currency: plan.currency,
          status: 'succeeded',
          provider: providerId,
          provider_ref: intent.reference,
          idempotency_key: `sub_${sub.id}_initial`,
          description: `${plan.name} aboneliği`,
        })
      }
    } catch (error) {
      console.log('[v0] subscribeToPlan: payment intent failed, rolling back incomplete subscription', {
        subscriptionId: sub.id,
        providerId,
        error: error instanceof Error ? error.message : String(error),
      })
      // Nothing was charged and no redirect will ever come back for this row,
      // so it must not survive to block a retry.
      await admin.from('billing_subscriptions').delete().eq('id', sub.id)
      return { ok: false, error: 'payment_init_failed', detail: toSafeFailureCode(error) }
    }
  }

  // Surface the new subscription in the admin "Bildirimler" screen (and ping the
  // platform admin by email). Best-effort: never blocks activation.
  await logUserEvent({
    userId,
    type: 'subscription_started',
    subject: `${plan.name} aboneliği başlatıldı`,
    body: `Kullanıcı ${plan.name} planına abone oldu (durum: ${subscriptionStatusLabelTr(status)}).`,
    emailAdmin: true,
    ...(paymentPending
      ? {
          adminSubject: (userEmail: string) => `${userEmail} üye abonelik başlatma talebi`,
          adminBody: (userEmail: string) =>
            `GLOVAL AI\n\n${userEmail} üye abonelik başlatma talebi\n\nKullanıcı e-posta adresi: ${userEmail}\nPaket adı: ${plan.name}\nİşlem No: ${initialPaymentReference ? formatTicketNumber(initialPaymentReference) : 'Bilinmiyor'}\nİşlem tarihi: ${new Date().toLocaleString('tr-TR', { hour12: false }).replace(',', '')}\nİşlem sonucu: Ödeme bekleniyor`,
        }
      : {}),
  })

  revalidatePath('/billing')
  return { ok: true, status, redirectUrl }
}

export type ChangePlanResult =
  | { ok: true; status: SubscriptionStatus; netCents: number; redirectUrl?: string }
  | { ok: false; error: string; detail?: string }

/**
 * Upgrade or downgrade the current subscription to another plan, applying a
 * proration credit for the unused portion of the current plan and a debit for
 * the new plan over the remaining period. Both are recorded in the ledger.
 */
export async function changePlan(
  planId: string,
  buyer?: CheckoutBuyer,
): Promise<ChangePlanResult> {
  const { userId, email } = await requireUser()
  const admin = createAdminClient()

  const { data: subData, error: subErr } = await admin
    .from('billing_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['trialing', 'active', 'past_due', 'suspended'])
    .maybeSingle()
  if (subErr) throw subErr
  const sub = subData as SubscriptionRow | null
  if (!sub) return { ok: false, error: 'no_active_subscription' }
  if (sub.plan_id === planId) return { ok: false, error: 'same_plan' }

  const [currentPlan, newPlan] = await Promise.all([
    getPlanById(sub.plan_id),
    getPlanById(planId),
  ])
  if (!newPlan || !newPlan.active) return { ok: false, error: 'plan_not_found' }
  if (!currentPlan) return { ok: false, error: 'current_plan_missing' }

  const now = new Date()
  const periodStart = new Date(sub.current_period_start)
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end)
    : addInterval(periodStart, currentPlan.interval)

  const { creditCents, debitCents, netCents } = computeProration({
    currentPriceCents: currentPlan.price_cents,
    newPriceCents: newPlan.price_cents,
    periodStart,
    periodEnd,
    now,
  })
  const isUpgrade = newPlan.price_cents >= currentPlan.price_cents
  const provider = getPlatformPaymentProvider()
  const providerId = getPlatformPaymentProviderId()

  // Paid upgrades are tracked with `pending_plan_id`/`pending_change_ref` on
  // the user's EXISTING subscription row rather than a second row: the
  // `uniq_billing_sub_active_user` index enforces at most one row per user
  // whose status is trialing/active/past_due/incomplete, so inserting a
  // second `incomplete` row for the same user while their real row is still
  // `active` always violated it and surfaced as a generic checkout error.
  // The subscription's status/plan_id stay untouched until the PSP result
  // settles; only these two columns record the in-flight change.
  if (isUpgrade && netCents > 0) {
    if (!buyer) return { ok: false, error: 'buyer_required' }

    // Clear any previous, abandoned pending-change attempt for this
    // subscription so its old `pending_change_ref` (unique when non-null)
    // can't collide with the new intent we're about to create.
    await admin
      .from('billing_subscriptions')
      .update({ pending_plan_id: null, pending_change_ref: null })
      .eq('id', sub.id)

    try {
      const intent = await provider.createIntent({
        orderId: `upgrade_${sub.id}_${now.getTime()}`,
        amountCents: netCents,
        currency: newPlan.currency,
        customerEmail: email,
        returnUrl: '/billing',
        publicConfig: {
          buyer: {
            fullName: buyer.fullName,
            phone: buyer.phone,
            address: buyer.address,
            identityNumber: buyer.taxId,
            ip: await resolveClientIp(),
          },
        },
      })
      const { error: pendingErr } = await admin
        .from('billing_subscriptions')
        .update({ pending_plan_id: newPlan.id, pending_change_ref: intent.reference })
        .eq('id', sub.id)
      if (pendingErr) throw pendingErr
      await admin.from('billing_transactions').insert({
        subscription_id: sub.id,
        user_id: userId,
        kind: 'charge',
        amount_cents: netCents,
        currency: newPlan.currency,
        status: 'pending',
        provider: providerId,
        provider_ref: intent.reference,
        idempotency_key: `upgrade_${sub.id}_${now.getTime()}`,
        description: `${currentPlan.name} → ${newPlan.name} paket yükseltme ara farkı`,
      })
      return { ok: true, status: 'incomplete', netCents, redirectUrl: intent.redirectUrl }
    } catch (error) {
      // Same reasoning as subscribeToPlan: never let a PSP failure escape as
      // an unhandled exception, or the client's already-open payment popup
      // is left stuck on `about:blank` with no way to recover.
      console.log('[v0] changePlan: payment intent failed, clearing pending change', {
        subscriptionId: sub.id,
        providerId,
        error: error instanceof Error ? error.message : String(error),
      })
      await admin
        .from('billing_subscriptions')
        .update({ pending_plan_id: null, pending_change_ref: null })
        .eq('id', sub.id)
      return { ok: false, error: 'payment_init_failed', detail: toSafeFailureCode(error) }
    }
  }

  // Ledger entries: credit unused current plan, debit new plan remainder.
  const stamp = now.getTime()
  const rows: Array<Record<string, unknown>> = []
  if (creditCents > 0) {
    rows.push({
      subscription_id: sub.id,
      user_id: userId,
      kind: 'proration_credit',
      amount_cents: -creditCents,
      currency: newPlan.currency,
      status: 'succeeded',
      provider: 'mock',
      idempotency_key: `change_${sub.id}_${stamp}_credit`,
      description: `${currentPlan.name} kullanılmayan süre iadesi`,
    })
  }
  if (debitCents > 0) {
    rows.push({
      subscription_id: sub.id,
      user_id: userId,
      kind: 'proration_debit',
      amount_cents: debitCents,
      currency: newPlan.currency,
      status: 'succeeded',
      provider: 'mock',
      idempotency_key: `change_${sub.id}_${stamp}_debit`,
      description: `${newPlan.name} kalan süre ücreti`,
    })
  }
  if (rows.length > 0) {
    const { error: txnErr } = await admin
      .from('billing_transactions')
      .insert(rows)
    if (txnErr) throw txnErr
  }

  const newStatus: SubscriptionStatus =
    newPlan.price_cents === 0 ? 'active' : sub.status === 'trialing' ? 'trialing' : 'active'

  const { error: updErr } = await admin
    .from('billing_subscriptions')
    .update({ plan_id: newPlan.id, status: newStatus })
    .eq('id', sub.id)
    .eq('user_id', userId)
  if (updErr) throw updErr

  // Log the upgrade/downgrade for the admin panel + notify the platform admin.
  await logUserEvent({
    userId,
    type: isUpgrade ? 'plan_upgraded' : 'plan_downgraded',
    subject: `${isUpgrade ? 'Paket yükseltme' : 'Paket düşürme'}: ${currentPlan.name} → ${newPlan.name}`,
    body: `Kullanıcı planını ${currentPlan.name} planından ${newPlan.name} planına ${
      isUpgrade ? 'yükseltti' : 'düşürdü'
    }. Net tutar: ${(netCents / 100).toFixed(2)} ${newPlan.currency}.`,
    emailAdmin: true,
  })

  revalidatePath('/billing')
  return { ok: true, status: newStatus, netCents }
}

export type RenewResult =
  | { ok: true; redirectUrl?: string }
  | { ok: false; error: string; detail?: string }

/**
 * Starts payment for the NEXT period of the user's current paid plan. It only
 * creates a PSP intent and a pending `renew_*` ledger row; the subscription is
 * extended/restored exclusively by `settlePaymentResult` once the payment is
 * verified server-side (see `settleSubscriptionRenewal`).
 */
export async function renewSubscription(
  buyer?: CheckoutBuyer,
  yearlyPlanId?: string,
): Promise<RenewResult> {
  const { userId, email } = await requireUser()
  const admin = createAdminClient()

  const { data: subData, error: subErr } = await admin
    .from('billing_subscriptions')
    .select('id, plan_id, status')
    .eq('user_id', userId)
    .in('status', ['active', 'past_due', 'suspended'])
    .maybeSingle()
  if (subErr) throw subErr
  if (!subData) return { ok: false, error: 'no_active_subscription' }

  const currentPlan = await getPlanById(subData.plan_id)
  if (!currentPlan || !currentPlan.active) return { ok: false, error: 'plan_not_found' }
  if (currentPlan.price_cents <= 0 || currentPlan.interval === 'once') {
    return { ok: false, error: 'not_renewable' }
  }

  // Monthly -> yearly switch of the SAME tier. The charged plan (and therefore
  // the price) is always the server-side catalog row; the client only names it,
  // and it is rejected unless it is the active yearly sibling of the current plan.
  let plan = currentPlan
  if (yearlyPlanId && yearlyPlanId !== currentPlan.id) {
    const target = await getPlanById(yearlyPlanId)
    if (!target || !target.active) return { ok: false, error: 'plan_not_found' }
    if (!isYearlySwitchTarget(currentPlan, target)) {
      return { ok: false, error: 'invalid_interval_switch' }
    }
    plan = target
  }
  if (!buyer) return { ok: false, error: 'buyer_required' }

  const staleCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data: openRenewals } = await admin
    .from('billing_transactions')
    .select('id, idempotency_key')
    .eq('subscription_id', subData.id)
    .eq('status', 'pending')
    .gte('created_at', staleCutoff)
  if ((openRenewals ?? []).some((t) => String(t.idempotency_key ?? '').startsWith('renew_'))) {
    return { ok: false, error: 'payment_pending' }
  }

  const key = `renew_${subData.id}_${Date.now()}${plan.id !== currentPlan.id ? `${RENEWAL_TARGET_MARKER}${plan.id}` : ''}`
  // Resolved inside the try: a misconfigured provider throws here, and an
  // unhandled throw would reach the browser as an opaque, message-less error.
  let providerId: PaymentProviderId | undefined
  try {
    const provider = getPlatformPaymentProvider()
    providerId = getPlatformPaymentProviderId()
    const intent = await provider.createIntent({
      orderId: key,
      amountCents: plan.price_cents,
      currency: plan.currency,
      customerEmail: email,
      returnUrl: '/billing',
      publicConfig: {
        buyer: {
          fullName: buyer.fullName,
          phone: buyer.phone,
          address: buyer.address,
          identityNumber: buyer.taxId,
          ip: await resolveClientIp(),
        },
      },
    })
    const { error: txnErr } = await admin.from('billing_transactions').insert({
      subscription_id: subData.id,
      user_id: userId,
      kind: 'charge',
      amount_cents: plan.price_cents,
      currency: plan.currency,
      status: 'pending',
      provider: providerId,
      provider_ref: intent.reference,
      idempotency_key: key,
      description: `${plan.name} yenileme`,
    })
    if (txnErr) throw txnErr

    if (intent.action === 'redirect') return { ok: true, redirectUrl: intent.redirectUrl }

    // Synchronous provider (mock): settle through the same verified path.
    const { settlePaymentResult } = await import('@/lib/payments/settle')
    await settlePaymentResult(providerId, {
      reference: intent.reference,
      kind: 'payment',
      status: 'paid',
      paidAmountCents: plan.price_cents,
      paidCurrency: plan.currency,
      orderRef: key,
    } as Parameters<typeof settlePaymentResult>[1])
    revalidatePath('/billing')
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    let environment: unknown = undefined
    if (providerId === 'iyzico') {
      const { describeIyzicoEnvironment } = await import('@/lib/payments/iyzico')
      environment = describeIyzicoEnvironment()
    }
    console.log('[v0] renewSubscription: payment intent failed', {
      subscriptionId: subData.id,
      error: message,
      environment,
    })
    return { ok: false, error: 'payment_init_failed', detail: toSafeFailureCode(error) }
  }
}

export type CancelResult =
  | { ok: true; effectiveAt: string | null }
  | { ok: false; error: string }

/**
 * Cancel the current subscription. By default it stays active until the end of
 * the paid period (cancel_at_period_end); pass immediate=true to cancel now.
 */
export async function cancelSubscription(
  immediate = false,
): Promise<CancelResult> {
  const { userId } = await requireUser()
  const admin = createAdminClient()

  const { data: subData, error: subErr } = await admin
    .from('billing_subscriptions')
    .select('id, plan_id, provider_ref, current_period_end, cancel_at_period_end, status')
    .eq('user_id', userId)
    .in('status', ['trialing', 'active', 'past_due', 'suspended'])
    .maybeSingle()
  if (subErr) throw subErr
  const sub = subData as
    | {
        id: string
        plan_id: string
        provider_ref: string | null
        current_period_end: string | null
        cancel_at_period_end: boolean
        status: string
      }
    | null
  if (!sub) return { ok: false, error: 'no_active_subscription' }
  if (!immediate && sub.cancel_at_period_end) {
    return { ok: true, effectiveAt: sub.current_period_end }
  }

  const [{ data: plan }, { data: transaction }] = await Promise.all([
    admin.from('billing_plans').select('name').eq('id', sub.plan_id).maybeSingle(),
    admin
      .from('billing_transactions')
      .select('provider_ref')
      .eq('subscription_id', sub.id)
      .eq('status', 'succeeded')
      .eq('kind', 'charge')
      .not('provider_ref', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const paymentReference = transaction?.provider_ref ?? sub.provider_ref

  const patch = immediate
    ? { status: 'canceled' as const, cancel_at_period_end: false }
    : { cancel_at_period_end: true }

  const { error: updErr } = await admin
    .from('billing_subscriptions')
    .update(patch)
    .eq('id', sub.id)
    .eq('user_id', userId)
  if (updErr) throw updErr

  // Record the cancellation for the admin panel + notify the platform admin.
  await logUserEvent({
    userId,
    type: 'subscription_canceled',
    subject: immediate ? 'Abonelik hemen iptal edildi' : 'Abonelik dönem sonunda iptal edilecek',
    body: immediate
      ? 'Kullanıcı aboneliğini hemen sonlandırdı.'
      : `Kullanıcı aboneliğini iptal etti; erişim ${
          sub.current_period_end ?? 'dönem sonu'
        } tarihine kadar sürecek.`,
    emailAdmin: true,
    adminSubject: (userEmail: string) => `${userEmail} üye abonelik iptali`,
    adminBody: (userEmail: string) => {
      const date = new Date()
        .toLocaleString('tr-TR', { hour12: false })
        .replace(',', '')
      return `GLOVAL AI\n\n${userEmail} üye aboneliğini iptal etti\n\nKullanıcı e-posta adresi: ${userEmail}\nPaket adı: ${plan?.name ?? 'Bilinmiyor'}\nİşlem No: ${paymentReference ? formatTicketNumber(paymentReference) : 'Bilinmiyor'}\nİşlem tarihi: ${date}\nİşlem sonucu: Abonelik iptal edildi`
    },
  })

  revalidatePath('/billing')
  return {
    ok: true,
    effectiveAt: immediate ? null : sub.current_period_end,
  }
}

export type PlanChangePreview =
  | {
      ok: true
      creditCents: number
      debitCents: number
      netCents: number
      currency: string
      currentPlanName: string
      newPlanName: string
      isUpgrade: boolean
    }
  | { ok: false; error: string }

/**
 * Read-only proration preview for switching to another plan. Uses the exact
 * same server-side math as `changePlan` but writes nothing, so the UI can show
 * the customer what they will be charged/credited before they confirm.
 */
export async function previewPlanChange(
  planId: string,
): Promise<PlanChangePreview> {
  const { userId } = await requireUser()
  const admin = createAdminClient()

  const { data: subData, error: subErr } = await admin
    .from('billing_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['trialing', 'active', 'past_due', 'suspended'])
    .maybeSingle()
  if (subErr) throw subErr
  const sub = subData as SubscriptionRow | null
  if (!sub) return { ok: false, error: 'no_active_subscription' }
  if (sub.plan_id === planId) return { ok: false, error: 'same_plan' }

  const [currentPlan, newPlan] = await Promise.all([
    getPlanById(sub.plan_id),
    getPlanById(planId),
  ])
  if (!newPlan || !newPlan.active) return { ok: false, error: 'plan_not_found' }
  if (!currentPlan) return { ok: false, error: 'current_plan_missing' }

  const now = new Date()
  const periodStart = new Date(sub.current_period_start)
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end)
    : addInterval(periodStart, currentPlan.interval)

  const { creditCents, debitCents, netCents } = computeProration({
    currentPriceCents: currentPlan.price_cents,
    newPriceCents: newPlan.price_cents,
    periodStart,
    periodEnd,
    now,
  })

  return {
    ok: true,
    creditCents,
    debitCents,
    netCents,
    currency: newPlan.currency,
    currentPlanName: currentPlan.name,
    newPlanName: newPlan.name,
    isUpgrade: newPlan.price_cents >= currentPlan.price_cents,
  }
}

/** The plan backing the user's current subscription, if any. */
export async function getMyCurrentPlan(): Promise<PlanRow | null> {
  const sub = await getMySubscription()
  if (!sub) return null
  return getPlanById(sub.plan_id)
}

/**
 * The plan code for an ARBITRARY user (their most recent subscription), resolved
 * via the service-role client. Used when an admin edits another tenant's site so
 * plan-gated features reflect the SITE OWNER's plan, not the admin's. Returns
 * null (→ FREE) when the user has never subscribed. Never throws.
 */
export async function getPlanCodeForUser(userId: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('billing_subscriptions')
      .select('plan_id')
      .eq('user_id', userId)
      .in('status', ['trialing', 'active', 'past_due', 'suspended'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data?.plan_id) return null
    const plan = await getPlanById(data.plan_id as string)
    return plan?.code ?? null
  } catch {
    return null
  }
}

/** The current user's entitlements (e.g. one-time unlimited grants). */
export async function getMyEntitlements(): Promise<EntitlementRow[]> {
  const { supabase, userId } = await requireUser()
  const { data, error } = await supabase
    .from('billing_entitlements')
    .select('id, user_id, code, name, kind, status, granted_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EntitlementRow[]
}
