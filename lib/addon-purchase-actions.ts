'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformPaymentProvider, getPlatformPaymentProviderId } from '@/lib/payments'
import { isAddOnCode } from '@/lib/add-ons'
import { addOnOrderRef } from '@/lib/addon-purchases'
import { loadCatalogPrice } from '@/lib/payments/addon-fulfillment'
import { verifyAddOnFulfillmentContext } from '@/lib/payments/addon-verify'
import type { CheckoutBuyer } from '@/lib/billing'

/**
 * Starts the purchase of one add-on through the existing iyzico Checkout Form.
 *
 * Only `addonCode` (and the buyer's contact details) are read from the caller.
 * Price, currency, capacity, plan and the subscription come from the session and
 * the database; any other property on the input is ignored. Nothing is granted
 * here: the verified callback runs `settleAddOnResult` (pending -> paid ->
 * granted), which re-checks amount, currency, basket id and the live subscription.
 */
export type PurchaseAddOnInput = {
  addonCode: string
  buyer?: CheckoutBuyer
}

export type PurchaseAddOnError =
  | 'unauthenticated'
  | 'invalid_addon'
  | 'no_subscription'
  | 'subscription_inactive'
  | 'not_eligible'
  | 'not_available'
  | 'purchase_in_progress'
  | 'payment_init_failed'
  | 'failed'

export type PurchaseAddOnResult =
  | { ok: true; purchaseId: string; redirectUrl: string }
  | { ok: false; error: PurchaseAddOnError; detail?: string }

/** Short, secret-free reason shown next to a generic payment-init failure so it can be reported. */
function failureDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s+/g, ' ').trim().slice(0, 160)
}

const ENTITLED_SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due']

/** An iyzico Checkout Form token stops being payable after roughly this long. */
const PAYMENT_TTL_MS = 30 * 60 * 1000

/**
 * A pending row that never got its payment token is only treated as abandoned
 * (reusable) after this grace period; before it, the first request may still be
 * talking to the PSP and a double click must not start a second payment.
 */
const ABANDONED_AFTER_MS = 60 * 1000

const PURCHASE_CURRENCY = 'TRY'

type AdminClient = ReturnType<typeof createAdminClient>

type OpenPurchase = {
  id: string
  status: string
  provider_ref: string | null
  created_at: string
}

async function resolveClientIp(): Promise<string> {
  try {
    const h = await headers()
    const forwarded = h.get('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0].trim()
    const real = h.get('x-real-ip')
    if (real) return real.trim()
  } catch {
    // headers() is unavailable outside a request context
  }
  return '127.0.0.1'
}

/**
 * Pending -> failed, only while the row is still pending. `unlinkedOnly` keeps a
 * concurrent request that already attached its payment token from being failed
 * by a sibling whose PSP call went wrong.
 */
async function failPending(admin: AdminClient, userId: string, purchaseId: string, unlinkedOnly: boolean) {
  let query = admin
    .from('addon_purchases')
    .update({ status: 'failed' })
    .eq('id', purchaseId)
    .eq('user_id', userId)
    .eq('status', 'pending')
  if (unlinkedOnly) query = query.is('provider_ref', null)
  const { error } = await query
  if (error) {
    console.log('[v0] purchaseAddOn: could not mark purchase failed', { purchaseId, error: error.message })
  }
}

export async function purchaseAddOn(input: PurchaseAddOnInput): Promise<PurchaseAddOnResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const addonCode = input?.addonCode
  if (!isAddOnCode(addonCode)) return { ok: false, error: 'invalid_addon' }

  const admin = createAdminClient()
  const now = Date.now()

  // The caller's own latest entitled subscription; same selection as the
  // billing page, then required to be strictly `active`.
  const { data: subRow, error: subError } = await admin
    .from('billing_subscriptions')
    .select('id, user_id, status, current_period_end, billing_plans!billing_subscriptions_plan_id_fkey(code)')
    .eq('user_id', user.id)
    .in('status', ENTITLED_SUBSCRIPTION_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (subError) return { ok: false, error: 'failed' }
  if (!subRow || subRow.user_id !== user.id) return { ok: false, error: 'no_subscription' }
  if (subRow.status !== 'active') return { ok: false, error: 'subscription_inactive' }

  const rawPlan = (subRow as unknown as { billing_plans: { code: string } | { code: string }[] | null })
    .billing_plans
  const plan = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan

  let price: Awaited<ReturnType<typeof loadCatalogPrice>>
  try {
    price = await loadCatalogPrice(admin, addonCode)
  } catch {
    return { ok: false, error: 'failed' }
  }
  // Only a live, active billing_plans row may be sold; the built-in list price
  // is a fallback for display and settlement, never a reason to open a charge.
  if (!price || price.source !== 'db' || price.currency.toUpperCase() !== PURCHASE_CURRENCY) {
    return { ok: false, error: 'not_available' }
  }

  const verdict = verifyAddOnFulfillmentContext({
    purchase: {
      user_id: user.id,
      addon_code: addonCode,
      amount: price.priceCents,
      currency: PURCHASE_CURRENCY,
    },
    subscription: {
      user_id: subRow.user_id as string,
      status: subRow.status as string,
      current_period_end: (subRow.current_period_end as string | null) ?? null,
      planCode: plan?.code,
    },
    catalogPrice: price,
  })
  if (!verdict.ok) {
    switch (verdict.reason) {
      case 'not_eligible':
        return { ok: false, error: 'not_eligible' }
      case 'subscription_inactive':
        return { ok: false, error: 'subscription_inactive' }
      case 'subscription_not_found':
      case 'user_mismatch':
        return { ok: false, error: 'no_subscription' }
      default:
        return { ok: false, error: 'failed' }
    }
  }

  const periodEnd = subRow.current_period_end as string

  let providerId: ReturnType<typeof getPlatformPaymentProviderId>
  let provider: ReturnType<typeof getPlatformPaymentProvider>
  try {
    providerId = getPlatformPaymentProviderId()
    provider = getPlatformPaymentProvider()
  } catch (error) {
    console.log('[v0] purchaseAddOn: payment provider unavailable', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, error: 'payment_init_failed', detail: failureDetail(error) }
  }

  // Open purchases of this user for this add-on on this subscription. Scoped by
  // the session user, so another user's rows can never be seen or reused.
  const { data: openRows, error: openError } = await admin
    .from('addon_purchases')
    .select('id, status, provider_ref, created_at')
    .eq('user_id', user.id)
    .eq('subscription_id', subRow.id)
    .eq('addon_code', addonCode)
    .in('status', ['pending', 'paid'])
  if (openError) return { ok: false, error: 'failed' }

  let reusable: OpenPurchase | null = null
  for (const row of (openRows ?? []) as OpenPurchase[]) {
    if (row.status !== 'pending') return { ok: false, error: 'purchase_in_progress' }
    const age = now - Date.parse(row.created_at)
    const withinPaymentWindow = age < PAYMENT_TTL_MS
    if (withinPaymentWindow && row.provider_ref === null && age >= ABANDONED_AFTER_MS && !reusable) {
      reusable = row
      continue
    }
    if (withinPaymentWindow) return { ok: false, error: 'purchase_in_progress' }
    // Past the payment window the token is dead; a late payment on it is
    // handled by settlement as a manual-refund case.
    await failPending(admin, user.id, row.id, false)
  }

  let purchase: { id: string; amount: number; currency: string }
  if (reusable) {
    const { data: refreshed, error: reuseError } = await admin
      .from('addon_purchases')
      .update({
        amount: price.priceCents,
        currency: PURCHASE_CURRENCY,
        period_end_snapshot: periodEnd,
        provider: providerId,
      })
      .eq('id', reusable.id)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .is('provider_ref', null)
      .select('id, amount, currency')
    if (reuseError) return { ok: false, error: 'failed' }
    if (!refreshed || refreshed.length === 0) return { ok: false, error: 'purchase_in_progress' }
    purchase = refreshed[0] as typeof purchase
  } else {
    const { data: inserted, error: insertError } = await admin
      .from('addon_purchases')
      .insert({
        user_id: user.id,
        subscription_id: subRow.id,
        addon_code: addonCode,
        amount: price.priceCents,
        currency: PURCHASE_CURRENCY,
        period_end_snapshot: periodEnd,
        status: 'pending',
        provider: providerId,
      })
      .select('id, amount, currency')
      .single()
    if (insertError || !inserted) {
      // 23505: the one-open-purchase index caught a concurrent double click.
      return { ok: false, error: insertError?.code === '23505' ? 'purchase_in_progress' : 'failed' }
    }
    purchase = inserted as typeof purchase
  }

  const buyer = input.buyer
  let intent: Awaited<ReturnType<typeof provider.createIntent>>
  try {
    intent = await provider.createIntent({
      orderId: addOnOrderRef(purchase.id),
      amountCents: purchase.amount,
      currency: purchase.currency,
      customerEmail: user.email ?? '',
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
  } catch (error) {
    console.log('[v0] purchaseAddOn: payment intent failed', {
      purchaseId: purchase.id,
      providerId,
      error: error instanceof Error ? error.message : String(error),
    })
    await failPending(admin, user.id, purchase.id, true)
    return { ok: false, error: 'payment_init_failed', detail: failureDetail(error) }
  }

  // Add-ons are only fulfilled by the verified callback, so the intent must be
  // a hosted checkout the buyer is redirected to.
  if (intent.status === 'failed' || intent.action !== 'redirect' || !intent.redirectUrl || !intent.reference) {
    await failPending(admin, user.id, purchase.id, true)
    return {
      ok: false,
      error: 'payment_init_failed',
      detail: `intent_${intent.status}_${intent.action}${intent.redirectUrl ? '' : '_no_redirect'}`,
    }
  }

  // Attach the token only while the purchase is still pending and unlinked: the
  // single winner of a race is the one request allowed to redirect the buyer.
  const { data: linked, error: linkError } = await admin
    .from('addon_purchases')
    .update({ provider_ref: intent.reference })
    .eq('id', purchase.id)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .is('provider_ref', null)
    .select('id')
  if (linkError) {
    await failPending(admin, user.id, purchase.id, false)
    return { ok: false, error: 'failed' }
  }
  if (!linked || linked.length === 0) return { ok: false, error: 'purchase_in_progress' }

  return { ok: true, purchaseId: purchase.id, redirectUrl: intent.redirectUrl }
}
