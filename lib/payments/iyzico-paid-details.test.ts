import { describe, expect, it } from 'vitest'
import { extractPaidDetails } from './iyzico-paid-details'

describe('extractPaidDetails', () => {
  it('reads the charged amount in cents, the currency and the basket id', () => {
    expect(
      extractPaidDetails({ paidPrice: '349.00', currency: ' try ', basketId: 'topup_ai_100_1', conversationId: 'c1' }),
    ).toEqual({ paidAmountCents: 34900, paidCurrency: 'TRY', orderRef: 'topup_ai_100_1' })
  })

  it('accepts a numeric paidPrice and rounds to whole cents', () => {
    expect(extractPaidDetails({ paidPrice: 99.9 }).paidAmountCents).toBe(9990)
    expect(extractPaidDetails({ paidPrice: 0.29 }).paidAmountCents).toBe(29)
  })

  it('falls back to conversationId when there is no basketId', () => {
    expect(extractPaidDetails({ conversationId: 'conv-9' }).orderRef).toBe('conv-9')
    expect(extractPaidDetails({ basketId: '', conversationId: 'conv-9' }).orderRef).toBe('conv-9')
  })

  it('leaves missing or unusable fields undefined so verification fails closed', () => {
    expect(extractPaidDetails({})).toEqual({ paidAmountCents: undefined, paidCurrency: undefined, orderRef: undefined })
    expect(extractPaidDetails({ paidPrice: 'abc', currency: 5 }).paidAmountCents).toBeUndefined()
    expect(extractPaidDetails({ currency: 5 }).paidCurrency).toBeUndefined()
  })
})
