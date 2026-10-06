import type {
  PaymentIntentInput,
  PaymentIntentResult,
  PaymentProvider,
  PaymentWebhookResult,
  RefundInput,
  RefundResult,
  SubscriptionCheckoutInput,
  SubscriptionCheckoutResult,
} from './types'

/**
 * Test payment provider. It settles synchronously so the full order flow can be
 * exercised end to end without any real PSP keys. Swapping in Stripe/iyzico
 * later means adding a sibling provider — no checkout/order changes required.
 */
export const mockProvider: PaymentProvider = {
  id: 'mock',

  capabilities: {
    synchronous: true,
    refunds: true,
    subscriptions: true,
    manualVerification: false,
  },

  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    // Simulate an approved authorization immediately.
    return {
      reference: `mock_${input.orderId}`,
      action: 'completed',
      status: 'paid',
    }
  },

  async createRefund(input: RefundInput): Promise<RefundResult> {
    return { reference: input.reference, status: 'refunded' }
  },

  async createSubscriptionCheckout(
    input: SubscriptionCheckoutInput,
  ): Promise<SubscriptionCheckoutResult> {
    // Settle the subscription immediately so billing flows are testable.
    return {
      reference: `mock_sub_${input.subscriptionId}`,
      action: 'completed',
      status: 'active',
    }
  },

  async parseWebhook(
    rawBody: string,
  ): Promise<PaymentWebhookResult | null> {
    try {
      const body = JSON.parse(rawBody) as {
        reference?: string
        status?: string
      }
      if (!body.reference) return null
      const status =
        body.status === 'failed'
          ? 'failed'
          : body.status === 'refunded'
            ? 'refunded'
            : 'paid'
      return { reference: body.reference, status }
    } catch {
      return null
    }
  },
}
