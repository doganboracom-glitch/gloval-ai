import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getPaymentProvider,
  getProviderWebhookSecret,
  type PaymentProviderId,
} from '@/lib/payments'

/**
 * Generic payment webhook endpoint. Async providers (Stripe, iyzico, PayTR)
 * POST here; the matching provider verifies and normalizes the payload, and we
 * update the order idempotently. Already-final orders are left untouched, so
 * duplicate webhook deliveries are safe.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await params
  const providerId = providerParam as PaymentProviderId
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
  // signature; mock ignores it. Secrets come from env, never from the client.
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

  const admin = createAdminClient()

  // Locate the order by its provider reference.
  const { data: order } = await admin
    .from('ecommerce_orders')
    .select('id, payment_status, status')
    .eq('payment_ref', result.reference)
    .maybeSingle()

  if (!order) {
    // Verified callback but no matching order: acknowledge so PayTR stops
    // retrying (nothing more we can do), but 404 for other providers.
    if (isPayTR) return new Response('OK')
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  }

  // Idempotency: ignore if the order is already in a final paid/refunded state.
  if (order.payment_status === 'paid' && result.status === 'paid') {
    return ack({ idempotent: true })
  }

  const paymentStatus = result.status
  const orderStatus =
    result.status === 'paid'
      ? 'paid'
      : result.status === 'refunded'
        ? 'refunded'
        : 'failed'

  await admin
    .from('ecommerce_orders')
    .update({ payment_status: paymentStatus, status: orderStatus })
    .eq('id', order.id)

  // Decrement stock only on the first transition into paid.
  if (result.status === 'paid' && order.payment_status !== 'paid') {
    const { data: items } = await admin
      .from('ecommerce_order_items')
      .select('product_id, quantity')
      .eq('order_id', order.id)

    for (const item of items ?? []) {
      if (!item.product_id) continue
      const { data: product } = await admin
        .from('ecommerce_products')
        .select('stock')
        .eq('id', item.product_id)
        .maybeSingle()
      if (product) {
        await admin
          .from('ecommerce_products')
          .update({ stock: Math.max(0, product.stock - item.quantity) })
          .eq('id', item.product_id)
      }
    }
  }

  return ack()
}
