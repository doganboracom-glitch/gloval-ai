'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformPaymentProvider, getPlatformPaymentProviderId } from '@/lib/payments'
import type { CheckoutBuyer } from '@/lib/billing'
import type { DomainErrorCode } from '../types'
import { finalizeRenewal, getLatestRenewal, quoteRenewal, type RenewalView } from './renewal-service'

/**
 * Paid renewal actions. The caller is always re-derived from the session, the
 * price is always recomputed server-side, and nothing price-related is read from
 * the client. The provider Renew call itself happens only in `finalizeRenewal`,
 * after the payment has been confirmed.
 */

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { userId: user.id, email: user.email ?? '' }
}

async function resolveClientIp(): Promise<string> {
  try {
    const h = await headers()
    const fwd = h.get('x-forwarded-for')
    if (fwd) return fwd.split(',')[0].trim()
    const real = h.get('x-real-ip')
    if (real) return real.trim()
  } catch {
    // headers() is unavailable outside a request context
  }
  return '127.0.0.1'
}

/** What the browser may see: the amount and the dates, never provider cost or FX. */
export type RenewalQuoteView = {
  domain: string
  years: number
  currentExpiryRaw: string | null
  remainingDays: number | null
  totalGrossMinor: number
  perYearGrossMinor: number
  vatBps: number
  currency: string
}

export type RenewalQuoteResponse =
  | { ok: true; quote: RenewalQuoteView }
  | { ok: false; error: DomainErrorCode }

export async function getMyRenewalQuote(domain: string, years: number): Promise<RenewalQuoteResponse> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }
  const result = await quoteRenewal(user.userId, domain, years)
  if (!result.ok) return result
  const q = result.quote
  return {
    ok: true,
    quote: {
      domain: q.domain,
      years: q.years,
      currentExpiryRaw: q.currentExpiryRaw,
      remainingDays: q.remainingDays,
      totalGrossMinor: q.totalGrossMinor,
      perYearGrossMinor: q.perYear.grossMinor,
      vatBps: q.perYear.vatBps,
      currency: q.paymentCurrency,
    },
  }
}

export type StartRenewalResult =
  | { ok: true; renewalId: string; redirectUrl?: string }
  | { ok: false; error: DomainErrorCode }

export async function startMyDomainRenewal(
  domain: string,
  years: number,
  buyer?: CheckoutBuyer,
): Promise<StartRenewalResult> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const result = await quoteRenewal(user.userId, domain, years)
  if (!result.ok) return result
  const quote = result.quote

  const admin = createAdminClient()
  const priceCents = quote.totalGrossMinor
  const currency = quote.paymentCurrency

  // The partial unique index allows one unfinished renewal per user and domain;
  // a double click or replay lands on the conflict instead of opening a 2nd charge.
  const { data: row, error: insertErr } = await admin
    .from('domain_renewals')
    .insert({
      user_id: user.userId,
      domain: quote.domain,
      tld: quote.tld,
      period_years: quote.years,
      status: 'pending_payment',
      price_cents: priceCents,
      currency,
      price_snapshot: quote.snapshot,
      baseline_expires_raw: quote.baselineExpiresRaw,
    })
    .select('id')
    .single()
  if (insertErr || !row) {
    return { ok: false, error: insertErr?.code === '23505' ? 'RENEWAL_IN_PROGRESS' : 'UNEXPECTED_ERROR' }
  }

  const providerId = getPlatformPaymentProviderId()
  const provider = getPlatformPaymentProvider()

  let intent
  try {
    intent = await provider.createIntent({
      orderId: `domren_${row.id}`,
      amountCents: priceCents,
      currency,
      customerEmail: user.email,
      returnUrl: `/dashboard/domains`,
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
  } catch {
    await admin
      .from('domain_renewals')
      .update({ status: 'failed', error_message: 'payment_init_failed', updated_at: new Date().toISOString() })
      .eq('id', row.id)
    return { ok: false, error: 'TEMPORARY_FAILURE' }
  }
  if (intent.status === 'failed') {
    await admin
      .from('domain_renewals')
      .update({ status: 'failed', error_message: 'payment_init_failed', updated_at: new Date().toISOString() })
      .eq('id', row.id)
    return { ok: false, error: 'TEMPORARY_FAILURE' }
  }

  await admin
    .from('domain_renewals')
    .update({ payment_provider: providerId, payment_reference: intent.reference, updated_at: new Date().toISOString() })
    .eq('id', row.id)

  await admin.from('billing_transactions').upsert(
    {
      user_id: user.userId,
      kind: 'charge',
      amount_cents: priceCents,
      currency,
      status: intent.action === 'completed' ? 'succeeded' : 'pending',
      provider: providerId,
      provider_ref: intent.reference,
      idempotency_key: `domren_${row.id}`,
      description: `Alan adı yenileme — ${quote.domain} (${quote.years} yıl)`,
    },
    { onConflict: 'user_id,idempotency_key', ignoreDuplicates: false },
  )

  if (intent.action === 'completed') {
    await admin
      .from('domain_renewals')
      .update({ status: 'payment_verified', updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending_payment')
    await finalizeRenewal(row.id)
    revalidatePath('/dashboard/domains')
    return { ok: true, renewalId: row.id }
  }

  return { ok: true, renewalId: row.id, redirectUrl: intent.redirectUrl }
}

export async function getMyLatestRenewal(domain: string): Promise<RenewalView | null> {
  const user = await requireUser()
  if (!user) return null
  return getLatestRenewal(user.userId, domain)
}
