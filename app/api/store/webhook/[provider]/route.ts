import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { scheduleOrderNotification } from '@/lib/store-order-notifications'
import {
  getPaymentProvider,
  getProviderWebhookSecret,
  isProviderImplemented,
} from '@/lib/payments'
import { finalizePaidStock, releaseOrderStock } from '@/lib/store-order-stock'
import { applyStorePaymentWebhook } from '@/lib/store-webhook-handler'
import { isStoreWebhookProvider } from '@/lib/store-webhook-rules'

/**
 * Generic payment webhook endpoint. Async providers (Stripe, iyzico, PayTR)
 * POST here; the matching provider verifies and normalizes the payload, and
 * `applyStorePaymentWebhook` updates the order idempotently (amount/currency
 * check, conditional transitions, stock and email only on the first paid).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await params

  // Only real, implemented PSPs may settle store orders. The registry falls
  // back to the mock provider (which accepts any payload as "paid") for unknown
  // ids, and `mock`/`bank_transfer` are not webhook providers at all.
  if (!isStoreWebhookProvider(providerParam) || !isProviderImplemented(providerParam)) {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 404 })
  }
  const providerId = providerParam
  const provider = getPaymentProvider(providerId)

  // PayTR mandates a plain-text "OK" body on every processed callback, or it
  // retries indefinitely. Other providers keep the JSON acknowledgement.
  const isPayTR = providerId === 'paytr'
  const ack = (extra?: Record<string, unknown>) =>
    isPayTR ? new Response('OK') : NextResponse.json({ ok: true, ...extra })

  const rawBody = await request.text()
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  // Real providers require their server-side webhook secret to verify the
  // signature. Secrets come from env, never from the client.
  const webhookSecret = getProviderWebhookSecret(providerId)
  const result = await provider.parseWebhook(rawBody, headers, webhookSecret)
  if (!result) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  // This endpoint handles store (e-commerce) payments only. Subscription
  // events belong to the separate SaaS billing webhook.
  if (result.kind === 'subscription') {
    return ack({ ignored: 'subscription' })
  }

  const outcome = await applyStorePaymentWebhook(createAdminClient(), providerId, result, {
    finalizePaidStock,
    releaseOrderStock,
    notifyOrder: scheduleOrderNotification,
  })

  switch (outcome.outcome) {
    case 'order_not_found':
      // Verified callback but no matching order: acknowledge so PayTR stops
      // retrying (nothing more we can do), but 404 for other providers.
      if (isPayTR) return new Response('OK')
      return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
    case 'rejected':
      // The order is NOT fulfilled. PayTR is acknowledged anyway because a
      // retry cannot fix an amount mismatch and would only repeat forever.
      if (isPayTR) return new Response('OK')
      return NextResponse.json({ error: outcome.reason }, { status: 422 })
    case 'duplicate':
      return ack({ idempotent: true })
    case 'ignored':
      return ack({ ignored: outcome.reason })
    default:
      return ack()
  }
}
