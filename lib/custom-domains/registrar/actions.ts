'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformPaymentProvider, getPlatformPaymentProviderId } from '@/lib/payments'
import { PaymentConfigError } from '@/lib/payments/types'
import { describeIyzicoEnvironment } from '@/lib/payments/iyzico'
import { evaluateDomainPaymentStackFromEnv } from '@/lib/payments/domain-e2e-mode'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { getMyCurrentPlan, getMySubscription, type CheckoutBuyer } from '@/lib/billing'
import { getDomainEntitlement } from '../access'
import { listDomainsForUser } from '../service'
import { getDomainRegistrarProvider, isLiveDomainRegistrar } from './provider'
import { finalizeDomainOrder, parsePurchaseDomain, searchDomainAvailability } from './service'
import { RegistrarError, type RegistrantContact } from './types'
import type { PricedDomainResult } from '../pricing/calc'
import { loadPricingContext } from '../pricing/context'
import { priceAvailabilityRows, resolveOrderPricing } from '../pricing/order'

/**
 * Server actions for buying a brand-new domain through the registrar. Kept
 * separate from `../actions.ts` (which is entirely about domains a customer
 * already owns elsewhere): this file owns search -> price -> pay -> register.
 *
 * Every action re-derives the caller from the session, same discipline as
 * `../actions.ts` — a client-supplied domain/price is only ever a preview.
 */

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHENTICATED')
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

/** Whether a real registrar is wired up; the buy-a-domain UI hides itself otherwise. */
export async function isDomainRegistrarLive(): Promise<boolean> {
  return isLiveDomainRegistrar()
}

export type DomainSearchErrorCode = 'NOT_CONFIGURED' | 'INVALID_QUERY' | 'PROVIDER_ERROR'

export type DomainSearchResponse =
  | { ok: true; results: PricedDomainResult[]; pricingAvailable: boolean }
  | { ok: false; error: DomainSearchErrorCode }

export async function searchMyDomainAvailability(query: string): Promise<DomainSearchResponse> {
  try {
    await requireUser()
    const raw = await searchDomainAvailability(query)
    const context = await loadPricingContext()
    const results = priceAvailabilityRows(raw, context)
    // Provider cost/currency never leave the server; only the TRY quote does.
    const pricingAvailable = results.every((r) => r.status !== 'available' || r.quote !== null)
    return { ok: true, results, pricingAvailable }
  } catch (error) {
    if (error instanceof RegistrarError) {
      const mapped: DomainSearchErrorCode =
        error.code === 'NOT_CONFIGURED'
          ? 'NOT_CONFIGURED'
          : error.code === 'INVALID_DOMAIN'
            ? 'INVALID_QUERY'
            : 'PROVIDER_ERROR'
      return { ok: false, error: mapped }
    }
    console.log('[v0] searchMyDomainAvailability failed:', error)
    return { ok: false, error: 'PROVIDER_ERROR' }
  }
}

export type PurchaseErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_DOMAIN'
  | 'UNAVAILABLE'
  | 'ALREADY_OWNED'
  | 'LIMIT_REACHED'
  | 'NOT_ENTITLED'
  | 'PRICING_UNAVAILABLE'
  /** The payment provider is misconfigured for this environment (e.g. sandbox host in production). */
  | 'PAYMENT_UNAVAILABLE'
  | 'FAILED'

export type StartPurchaseResult =
  | { ok: true; orderId: string; redirectUrl?: string }
  | { ok: false; error: PurchaseErrorCode }

/**
 * Buy a new domain: re-checks availability/price server-side, opens a
 * `domain_orders` row, and starts a platform checkout. On a synchronous
 * provider (mock) the registration is finalized immediately; on a real PSP
 * the caller is redirected and `finalizeDomainOrder` runs from
 * `settlePaymentResult` once the payment is confirmed.
 */
export async function startMyDomainPurchase(
  domainInput: string,
  periodYears: number,
  contact: RegistrantContact,
  buyer?: CheckoutBuyer,
): Promise<StartPurchaseResult> {
  const { userId, email } = await requireUser()

  const registrar = getDomainRegistrarProvider()
  if (!registrar) return { ok: false, error: 'NOT_CONFIGURED' }

  // In production only two pairings may run: live iyzico + live registrar, or
  // (while DOMAIN_E2E_TEST_MODE=true, admins only) sandbox iyzico + OTE registrar.
  // Anything else would charge real money for a registration that never happens,
  // or register a real domain off a sandbox payment.
  const stack = evaluateDomainPaymentStackFromEnv()
  if (!stack.allowed) {
    console.log('[v0] startMyDomainPurchase: blocked by payment stack guard', { reason: stack.reason })
    return { ok: false, error: 'NOT_CONFIGURED' }
  }
  if (stack.mode === 'e2e_test' && !isAdminEmail(email)) {
    console.log('[v0] startMyDomainPurchase: E2E test mode is admin-only')
    return { ok: false, error: 'NOT_CONFIGURED' }
  }

  const parsed = parsePurchaseDomain(domainInput)
  if (!parsed) return { ok: false, error: 'INVALID_DOMAIN' }
  const safePeriod = Number.isInteger(periodYears) && periodYears >= 1 && periodYears <= 10 ? periodYears : 1

  // Buying a domain is a paid, standalone product: it is intentionally NOT gated
  // by the plan's connect-your-own-domain entitlement or domain limit.
  const mine = await listDomainsForUser(userId)
  if (mine.some((d) => d.domain === parsed.domain)) return { ok: false, error: 'ALREADY_OWNED' }

  let availability
  try {
    availability = await registrar.checkAvailability(parsed.domain)
  } catch (error) {
    console.log('[v0] startMyDomainPurchase: availability re-check failed', error)
    return { ok: false, error: 'FAILED' }
  }
  const match = availability.find((a) => a.domain === parsed.domain) ?? availability[0]
  if (!match || match.status !== 'available' || !match.price) return { ok: false, error: 'UNAVAILABLE' }

  // Price is derived only from the registrar re-check above plus server-held
  // FX/VAT; nothing price-related is accepted from the client.
  const pricing = resolveOrderPricing({
    price: match.price,
    periodYears: safePeriod,
    context: await loadPricingContext(),
  })
  if (!pricing.ok) {
    console.log('[v0] startMyDomainPurchase: pricing unavailable', pricing.reason)
    return { ok: false, error: 'PRICING_UNAVAILABLE' }
  }

  const admin = createAdminClient()
  const priceCents = pricing.paymentAmount.amountCents
  const currency = pricing.paymentAmount.currency

  const { data: order, error: orderErr } = await admin
    .from('domain_orders')
    .insert({
      user_id: userId,
      domain: parsed.domain,
      tld: parsed.tld,
      period_years: safePeriod,
      status: 'pending_payment',
      ...pricing.orderFields,
      provider_response: { contact },
    })
    .select('id')
    .single()
  if (orderErr || !order) return { ok: false, error: 'FAILED' }

  const providerId = getPlatformPaymentProviderId()
  const provider = getPlatformPaymentProvider()

  let intent
  try {
    // `getPlatformPaymentProvider()` above can already throw PaymentConfigError
    // (e.g. mock forbidden in production), so the order is handled below either way.
    intent = await provider.createIntent({
      orderId: `domreg_${order.id}`,
      amountCents: priceCents,
      currency,
      customerEmail: email,
      returnUrl: '/dashboard/domains',
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
    console.log('[v0] startMyDomainPurchase: payment intent failed', {
      orderId: order.id,
      stage: 'create_intent',
      error: error instanceof Error ? error.message : String(error),
      ...(providerId === 'iyzico' ? { iyzico: describeIyzicoEnvironment() } : {}),
    })
    // PaymentConfigError messages are fixed machine codes (no secrets), so they
    // are safe to persist and make the real stage/cause visible on the order.
    const isConfigError = error instanceof PaymentConfigError
    await admin
      .from('domain_orders')
      .update({
        status: 'failed',
        error_message: isConfigError ? `payment_config:${error.message}` : 'payment_init_failed',
      })
      .eq('id', order.id)
    return { ok: false, error: isConfigError ? 'PAYMENT_UNAVAILABLE' : 'FAILED' }
  }
  if (intent.status === 'failed') {
    await admin.from('domain_orders').update({ status: 'failed' }).eq('id', order.id)
    return { ok: false, error: 'FAILED' }
  }

  await admin
    .from('domain_orders')
    .update({ payment_provider: providerId, payment_reference: intent.reference })
    .eq('id', order.id)

  await admin.from('billing_transactions').upsert(
    {
      user_id: userId,
      kind: 'charge',
      amount_cents: priceCents,
      currency,
      status: intent.action === 'completed' ? 'succeeded' : 'pending',
      provider: providerId,
      provider_ref: intent.reference,
      idempotency_key: `domreg_${order.id}`,
      description: `Alan adı kaydı — ${parsed.domain}`,
    },
    { onConflict: 'user_id,idempotency_key', ignoreDuplicates: false },
  )

  if (intent.action === 'completed') {
    await admin.from('domain_orders').update({ status: 'payment_verified' }).eq('id', order.id)
    await finalizeDomainOrder(order.id)
    revalidatePath('/dashboard/domains')
    return { ok: true, orderId: order.id }
  }

  return { ok: true, orderId: order.id, redirectUrl: intent.redirectUrl }
}

export type MyDomainOrder = {
  id: string
  domain: string
  status: string
  priceCents: number
  currency: string
  createdAt: string
  errorMessage: string | null
  /** VAT breakdown (TRY) for orders created with the TL pricing layer; null for legacy orders. */
  breakdown: { netCents: number; vatCents: number; vatBps: number } | null
}

/** Recent purchase attempts for the current user, for a status list under the search UI. */
export async function getMyDomainOrders(): Promise<MyDomainOrder[]> {
  const { userId } = await requireUser()
  const admin = createAdminClient()
  const base = 'id, domain, status, price_cents, currency, created_at, error_message'
  const query = (columns: string) =>
    admin.from('domain_orders').select(columns).eq('user_id', userId).order('created_at', { ascending: false }).limit(20)

  // `price_snapshot` is added by migration 015; fall back to the legacy column
  // set so the list keeps working before that migration is applied.
  let { data, error } = await query(`${base}, price_snapshot`)
  if (error) ({ data } = await query(base))

  type Row = {
    id: string
    domain: string
    status: string
    price_cents: number
    currency: string
    created_at: string
    error_message: string | null
    price_snapshot?: { netTryMinor?: number; vatTryMinor?: number; vatBps?: number } | null
  }

  return ((data ?? []) as unknown as Row[]).map((r) => {
    const s = r.price_snapshot
    const hasBreakdown =
      s && Number.isFinite(s.netTryMinor) && Number.isFinite(s.vatTryMinor) && Number.isFinite(s.vatBps)
    return {
      id: r.id,
      domain: r.domain,
      status: r.status,
      priceCents: r.price_cents,
      currency: r.currency,
      createdAt: r.created_at,
      errorMessage: r.error_message,
      breakdown: hasBreakdown
        ? { netCents: s.netTryMinor as number, vatCents: s.vatTryMinor as number, vatBps: s.vatBps as number }
        : null,
    }
  })
}
