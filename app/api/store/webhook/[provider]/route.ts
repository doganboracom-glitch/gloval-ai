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
import { loadStorePaytr } from '@/lib/store-payments/paytr-credentials'
import { PAYTR_WEBHOOK_MAX_BYTES, processPaytrCallback } from '@/lib/store-payments/paytr-webhook'
import { parsePaytrCallbackBody } from '@/lib/store-payments/paytr-core'
import { isStoreWebhookProvider } from '@/lib/store-webhook-rules'

/**
 * PayTR callbacks carry no store identifier, so the store is resolved from the
 * order that owns `merchant_oid`. The hash is then verified with THAT store's
 * own Merchant Key/Salt before anything changes. PayTR requires a plain `OK`
 * for every callback it should stop retrying; anything unverified is also
 * answered `OK` (a retry cannot fix it) but never alters an order.
 */
async function handlePaytr(request: Request): Promise<Response> {
  const ok = () => new Response('OK')
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > PAYTR_WEBHOOK_MAX_BYTES) return ok()
  const rawBody = await request.text()
  if (rawBody.length > PAYTR_WEBHOOK_MAX_BYTES) return ok()

  const callback = parsePaytrCallbackBody(rawBody)
  if (!callback) return ok()

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('ecommerce_orders')
    .select('project_id')
    .eq('payment_provider', 'paytr')
    .eq('payment_ref', callback.merchantOid)
    .maybeSingle()
  if (!order?.project_id) return ok()

  const outcome = await processPaytrCallback(
    admin,
    order.project_id as string,
    rawBody,
    async (projectId) => (await loadStorePaytr(admin, projectId)).credentials,
    { finalizePaidStock, releaseOrderStock, notifyOrder: scheduleOrderNotification },
  )
  if (outcome.outcome === 'bad_hash' || outcome.outcome === 'no_credentials') {
    console.error('[store-paytr] callback not verified', { reason: outcome.outcome })
  }
  return ok()
}

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

  if (providerId === 'paytr') return handlePaytr(request)

  const provider = getPaymentProvider(providerId)
  if (!provider) {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 404 })
  }
  const ack = (extra?: Record<string, unknown>) => NextResponse.json({ ok: true, ...extra })

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
      return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
    case 'rejected':
      return NextResponse.json({ error: outcome.reason }, { status: 422 })
    case 'duplicate':
      return ack({ idempotent: true })
    case 'ignored':
      return ack({ ignored: outcome.reason })
    default:
      return ack()
  }
}
