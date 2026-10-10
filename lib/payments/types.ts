/**
 * Provider-agnostic payment abstraction. Concrete providers (Mock now; Stripe,
 * iyzico, PayTR later) implement this interface so checkout/order code never
 * depends on a specific PSP. Amounts are always integer minor units (cents).
 */

export type PaymentProviderId =
  | 'mock'
  | 'stripe'
  | 'iyzico'
  | 'paytr'
  | 'bank_transfer'
  | 'cash_on_delivery'

/**
 * Raised when a provider is asked to do real work but has not been configured
 * with the required secret. Callers can catch this to fall back gracefully
 * instead of leaking a low-level error to the buyer.
 */
export class PaymentConfigError extends Error {
  constructor(
    public providerId: PaymentProviderId,
    message = 'payment_provider_not_configured',
  ) {
    super(message)
    this.name = 'PaymentConfigError'
  }
}

export interface PaymentIntentInput {
  orderId: string
  amountCents: number
  currency: string
  customerEmail: string
  /** Absolute URL the buyer returns to after payment. */
  returnUrl: string
  /** Non-secret provider config (public keys, mode, etc.). */
  publicConfig?: Record<string, unknown>
  /** Decrypted provider secret, only ever passed on the server. */
  secret?: string | null
}

export interface PaymentIntentResult {
  /** Provider-side reference/id for this payment attempt. */
  reference: string
  /**
   * Where to send the buyer next:
   * - 'redirect': navigate to `redirectUrl` (hosted checkout).
   * - 'completed': payment already settled synchronously (mock/test).
   */
  action: 'redirect' | 'completed'
  redirectUrl?: string
  status: 'pending' | 'authorized' | 'paid' | 'failed'
}

export interface PaymentWebhookResult {
  /** What the webhook is about: a one-off payment or a subscription event. */
  kind?: 'payment' | 'subscription'
  reference: string
  status: 'paid' | 'failed' | 'refunded'
  /**
   * Amount the PSP reports as actually charged (minor units) and its currency,
   * when the verified provider response includes them. Used to cross-check
   * against the server-side order amount before fulfilling.
   */
  paidAmountCents?: number
  paidCurrency?: string
  /**
   * How `paidAmountCents` must relate to the order total. Defaults to 'exact';
   * 'at_least' is for PSPs whose signed total can include an installment fee.
   */
  amountMatch?: 'exact' | 'at_least'
  /** Reference the order was created with (iyzico conversationId/basketId). */
  orderRef?: string
  /** Present for subscription webhooks (kind === 'subscription'). */
  subscriptionRef?: string
  subscriptionStatus?: SubscriptionStatus
}

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'canceled'
  | 'incomplete'

export interface RefundInput {
  /** Provider-side payment reference to refund. */
  reference: string
  /** Amount to refund in minor units; omit for a full refund. */
  amountCents?: number
  secret?: string | null
}

export interface RefundResult {
  reference: string
  status: 'refunded' | 'pending' | 'failed'
}

export interface SubscriptionCheckoutInput {
  /** Local subscription id we are creating a payment session for. */
  subscriptionId: string
  /** Provider price/plan identifier (e.g. a Stripe price id). */
  providerPriceId: string
  customerEmail: string
  returnUrl: string
  publicConfig?: Record<string, unknown>
  secret?: string | null
}

export interface SubscriptionCheckoutResult {
  reference: string
  action: 'redirect' | 'completed'
  redirectUrl?: string
  status: SubscriptionStatus
}

export interface PaymentProvider {
  id: PaymentProviderId
  /** Capability flags let callers know what a provider can do at runtime. */
  capabilities: {
    /** Settles synchronously (test/mock) vs. redirect/async (real PSPs). */
    synchronous: boolean
    refunds: boolean
    subscriptions: boolean
    /** Buyer pays out of band (e.g. bank transfer) and a human verifies it. */
    manualVerification: boolean
  }
  /** Create a payment attempt for an order. */
  createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult>
  /**
   * Parse and verify an incoming provider webhook/callback into a normalized
   * result. Returns null if the payload cannot be verified.
   */
  parseWebhook(
    rawBody: string,
    headers: Record<string, string>,
    secret?: string | null,
  ): Promise<PaymentWebhookResult | null>
  /** Refund a settled payment (readiness for future refund flows). */
  createRefund?(input: RefundInput): Promise<RefundResult>
  /** Start a subscription checkout (readiness for SaaS billing). */
  createSubscriptionCheckout?(
    input: SubscriptionCheckoutInput,
  ): Promise<SubscriptionCheckoutResult>
}
