import { describe, expect, it } from 'vitest'
import { verifyPaidFacts } from './paid-facts'

describe('verifyPaidFacts', () => {
  const expected = { amountCents: 100000, currency: 'TRY', orderRef: 'order-1' }
  it('accepts an exact paid amount in minor units', () => expect(verifyPaidFacts(expected, { paidAmountCents: 100000, paidCurrency: 'TL', orderRef: 'order-1' }, { require: 'all' })).toEqual({ ok: true }))
  it.each([undefined, 99999, 100001])('rejects missing or non-exact amount: %s', (paidAmountCents) => {
    expect(verifyPaidFacts(expected, { paidAmountCents, paidCurrency: 'TRY', orderRef: 'order-1' }, { require: 'all' }).ok).toBe(false)
  })
  it('rejects missing currency and order reference', () => {
    expect(verifyPaidFacts(expected, { paidAmountCents: 100000 }, { require: 'all' })).toEqual({ ok: false, reason: 'unverified_payment' })
  })
})
