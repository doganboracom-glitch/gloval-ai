import { createHmac, timingSafeEqual } from 'crypto'
import {
  PaymentConfigError,
  type PaymentIntentInput,
  type PaymentIntentResult,
  type PaymentProvider,
  type PaymentWebhookResult,
  type RefundInput,
  type RefundResult,
  type SubscriptionCheckoutInput,
  type SubscriptionCheckoutResult,
} from './types'

/**
 * Stripe adapter. Implemented with the Stripe REST API over `fetch` so no SDK
 * dependency is required. It is entirely server-side: the secret key is passed
 * in (decrypted from per-store settings for e-commerce, or a server env var for
 * SaaS billing) and never touches the client.
 *
 * This adapter is structurally complete for checkout sessions, payment intents,
 * refunds, subscriptions, and webhook signature verification. Real charges only
 * happen once a real secret key is supplied — until then callers fall back to
 * the mock provider, so nothing here needs live keys to compile or be tested.
 */
const STRIPE_API = 'https://api.stripe.com/v1'

function form(body: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) params.append(key, String(value))
  }
  return params.toString()
}

async function stripeFetch(
  path: string,
  secret: string,
  body: Record<string, string | number | undefined>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form(body),
  })
  const json = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined
    throw new Error(`stripe_error: ${err?.message ?? res.status}`)
  }
  return json
}

export const stripeProvider: PaymentProvider = {
  id: 'stripe',

  capabilities: {
    synchronous: false,
    refunds: true,
    subscriptions: true,
    manualVerification: false,
  },

  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    if (!input.secret) throw new PaymentConfigError('stripe')

    // Hosted Checkout Session in payment mode. Stripe validates the amount;
    // we always pass the server-computed total, never a client value.
    const session = await stripeFetch('/checkout/sessions', input.secret, {
      mode: 'payment',
      'line_items[0][price_data][currency]': input.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': input.amountCents,
      'line_items[0][price_data][product_data][name]': `Order ${input.orderId}`,
      'line_items[0][quantity]': 1,
      customer_email: input.customerEmail,
      success_url: input.returnUrl,
      cancel_url: input.returnUrl,
      'metadata[order_id]': input.orderId,
    })

    return {
      reference: String(session.id),
      action: 'redirect',
      redirectUrl: session.url ? String(session.url) : undefined,
      status: 'pending',
    }
  },

  async createRefund(input: RefundInput): Promise<RefundResult> {
    if (!input.secret) throw new PaymentConfigError('stripe')
    const refund = await stripeFetch('/refunds', input.secret, {
      payment_intent: input.reference,
      amount: input.amountCents,
    })
    const status = String(refund.status)
    return {
      reference: String(refund.id),
      status: status === 'succeeded' ? 'refunded' : status === 'pending' ? 'pending' : 'failed',
    }
  },

  async createSubscriptionCheckout(
    input: SubscriptionCheckoutInput,
  ): Promise<SubscriptionCheckoutResult> {
    if (!input.secret) throw new PaymentConfigError('stripe')
    const session = await stripeFetch('/checkout/sessions', input.secret, {
      mode: 'subscription',
      'line_items[0][price]': input.providerPriceId,
      'line_items[0][quantity]': 1,
      customer_email: input.customerEmail,
      success_url: input.returnUrl,
      cancel_url: input.returnUrl,
      'metadata[subscription_id]': input.subscriptionId,
    })
    return {
      reference: String(session.id),
      action: 'redirect',
      redirectUrl: session.url ? String(session.url) : undefined,
      status: 'incomplete',
    }
  },

  async parseWebhook(
    rawBody: string,
    headers: Record<string, string>,
    secret?: string | null,
  ): Promise<PaymentWebhookResult | null> {
    // Verify the Stripe signature (HMAC-SHA256 over `${t}.${payload}`).
    if (!secret) return null
    const sigHeader = headers['stripe-signature']
    if (!sigHeader) return null
    if (!verifyStripeSignature(rawBody, sigHeader, secret)) return null

    let event: {
      type?: string
      data?: { object?: Record<string, unknown> }
    }
    try {
      event = JSON.parse(rawBody)
    } catch {
      return null
    }

    const obj = event.data?.object ?? {}
    const type = event.type ?? ''

    // Subscription lifecycle events.
    if (type.startsWith('customer.subscription.')) {
      const statusMap: Record<string, PaymentWebhookResult['subscriptionStatus']> = {
        'customer.subscription.created': 'active',
        'customer.subscription.updated': 'active',
        'customer.subscription.deleted': 'canceled',
      }
      return {
        kind: 'subscription',
        reference: String(obj.id ?? ''),
        status: type === 'customer.subscription.deleted' ? 'failed' : 'paid',
        subscriptionRef: String(obj.id ?? ''),
        subscriptionStatus: statusMap[type] ?? 'active',
      }
    }

    // One-off payment events.
    if (type === 'checkout.session.completed' || type === 'payment_intent.succeeded') {
      return { kind: 'payment', reference: String(obj.id ?? ''), status: 'paid' }
    }
    if (type === 'payment_intent.payment_failed') {
      return { kind: 'payment', reference: String(obj.id ?? ''), status: 'failed' }
    }
    if (type === 'charge.refunded') {
      return { kind: 'payment', reference: String(obj.id ?? ''), status: 'refunded' }
    }

    return null
  },
}

/** Constant-time verification of a Stripe `stripe-signature` header. */
function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const [k, v] = kv.split('=')
      return [k.trim(), v]
    }),
  ) as { t?: string; v1?: string }
  if (!parts.t || !parts.v1) return false

  const expected = createHmac('sha256', secret)
    .update(`${parts.t}.${payload}`)
    .digest('hex')
  try {
    const a = Buffer.from(expected)
    const b = Buffer.from(parts.v1)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
