import type { PaymentProviderId, PaymentWebhookResult } from '@/lib/payments/types'

/**
 * Providers allowed to call the STORE webhook. `mock` and `bank_transfer` are
 * deliberately absent: the mock adapter trusts any unsigned payload and bank
 * transfers are confirmed by a human, so neither may settle an order here.
 */
export const STORE_WEBHOOK_PROVIDERS: ReadonlySet<PaymentProviderId> = new Set<PaymentProviderId>([
  'stripe',
  'paytr',
  'iyzico',
])

export function isStoreWebhookProvider(value: string): value is PaymentProviderId {
  return STORE_WEBHOOK_PROVIDERS.has(value as PaymentProviderId)
}

export type AmountCheckFailure = 'amount_missing' | 'amount_mismatch' | 'currency_mismatch'

/**
 * Cross-checks the verified PSP amount against the server-side order total
 * before a payment may fulfil the order. Fails closed when the provider did
 * not report an amount. `at_least` is for PSPs whose signed total may include
 * an installment surcharge (PayTR): underpaying is rejected, overpaying is not.
 */
export function checkPaidAmount(
  result: Pick<PaymentWebhookResult, 'paidAmountCents' | 'paidCurrency' | 'amountMatch'>,
  order: { total_cents: number; currency: string },
): AmountCheckFailure | null {
  const paid = result.paidAmountCents
  if (typeof paid !== 'number' || !Number.isFinite(paid)) return 'amount_missing'

  const matches =
    result.amountMatch === 'at_least' ? paid >= order.total_cents : paid === order.total_cents
  if (!matches) return 'amount_mismatch'

  if (result.paidCurrency) {
    const normalize = (c: string) => {
      const up = c.trim().toUpperCase()
      return up === 'TL' ? 'TRY' : up
    }
    if (normalize(result.paidCurrency) !== normalize(order.currency)) return 'currency_mismatch'
  }
  return null
}
