'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformPaymentProvider, getPlatformPaymentProviderId } from '@/lib/payments'
import { toSafeFailureCode } from '@/lib/payments/failure-code'
import { grantTopUpCredits } from '@/lib/payments/topup-fulfillment'
import { buildTopUpOrderRef, getCreditTopUp } from '@/lib/pricing-config'
import type { CheckoutBuyer } from '@/lib/billing'

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

export type PurchaseCreditTopUpResult =
  | { ok: true; redirectUrl?: string }
  | {
      ok: false
      error: 'unauthenticated' | 'not_found' | 'payment_init_failed' | 'failed'
      detail?: string
    }

/**
 * Starts the purchase of one AI credit pack.
 *
 * Only the pack id is taken from the client. Price, currency and credit
 * amount come from the server-side catalog (`CREDIT_TOPUPS`), and credits are
 * never written here for a redirect-based provider: a pending ledger charge is
 * recorded and the verified callback/webhook (`settleTopUpResult`) releases the
 * credits once, after the provider confirms the exact amount.
 */
export async function purchaseCreditTopUp(
  packId: string,
  buyer?: CheckoutBuyer,
): Promise<PurchaseCreditTopUpResult> {
  const pack = getCreditTopUp(packId)
  if (!pack) return { ok: false, error: 'not_found' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const admin = createAdminClient()
  const providerId = getPlatformPaymentProviderId()
  const provider = getPlatformPaymentProvider()
  const orderRef = buildTopUpOrderRef(pack.id, randomUUID())

  let intent
  try {
    intent = await provider.createIntent({
      orderId: orderRef,
      amountCents: pack.priceCents,
      currency: pack.currency,
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
    console.log('[v0] purchaseCreditTopUp: payment intent failed', {
      packId: pack.id,
      providerId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, error: 'payment_init_failed', detail: toSafeFailureCode(error) }
  }
  if (intent.status === 'failed') {
    return { ok: false, error: 'payment_init_failed', detail: 'provider_intent_failed' }
  }

  const { data: inserted, error: insertError } = await admin
    .from('billing_transactions')
    .insert({
      user_id: user.id,
      kind: 'charge',
      amount_cents: pack.priceCents,
      currency: pack.currency,
      status: 'pending',
      provider: providerId,
      provider_ref: intent.reference,
      idempotency_key: orderRef,
      description: `AI Ek Paket ${pack.credits}`,
    })
    .select('id, user_id, amount_cents, currency, status, provider_ref, idempotency_key')
    .single()
  if (insertError || !inserted) return { ok: false, error: 'failed' }

  const settlesAsync = !provider.capabilities.synchronous && intent.action === 'redirect'
  if (settlesAsync) return { ok: true, redirectUrl: intent.redirectUrl }

  // Synchronous provider (mock/test): the intent itself is the confirmation.
  if (intent.status !== 'paid' && intent.action !== 'completed') {
    return { ok: false, error: 'failed' }
  }
  try {
    await grantTopUpCredits(admin, inserted, pack, providerId)
  } catch (error) {
    console.log('[v0] purchaseCreditTopUp: grant failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, error: 'failed' }
  }
  revalidatePath('/billing')
  return { ok: true }
}
