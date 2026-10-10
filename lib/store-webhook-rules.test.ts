import { describe, expect, it } from 'vitest'
import { checkPaidAmount, isStoreWebhookProvider } from '@/lib/store-webhook-rules'

const order = { total_cents: 5000, currency: 'TRY' }

describe('isStoreWebhookProvider', () => {
  it.each(['stripe', 'paytr', 'iyzico'])('allows %s', (id) => {
    expect(isStoreWebhookProvider(id)).toBe(true)
  })

  it.each(['mock', 'bank_transfer', 'unknown', ''])('rejects %s', (id) => {
    expect(isStoreWebhookProvider(id)).toBe(false)
  })
})

describe('checkPaidAmount', () => {
  it('accepts an exact amount and currency', () => {
    expect(checkPaidAmount({ paidAmountCents: 5000, paidCurrency: 'TRY' }, order)).toBeNull()
  })

  it('treats TL as TRY', () => {
    expect(checkPaidAmount({ paidAmountCents: 5000, paidCurrency: 'tl' }, order)).toBeNull()
  })

  it('fails closed when the provider reported no amount', () => {
    expect(checkPaidAmount({}, order)).toBe('amount_missing')
  })

  it('rejects underpayment and overpayment on exact match', () => {
    expect(checkPaidAmount({ paidAmountCents: 4999 }, order)).toBe('amount_mismatch')
    expect(checkPaidAmount({ paidAmountCents: 5001 }, order)).toBe('amount_mismatch')
  })

  it('allows an installment surcharge but not underpayment for at_least', () => {
    expect(checkPaidAmount({ paidAmountCents: 5300, amountMatch: 'at_least' }, order)).toBeNull()
    expect(checkPaidAmount({ paidAmountCents: 4900, amountMatch: 'at_least' }, order)).toBe(
      'amount_mismatch',
    )
  })

  it('rejects a currency mismatch', () => {
    expect(checkPaidAmount({ paidAmountCents: 5000, paidCurrency: 'USD' }, order)).toBe(
      'currency_mismatch',
    )
  })
})
