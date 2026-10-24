import { describe, expect, it } from 'vitest'
import { verifyTopUpPayment } from './topup-verify'

describe('verifyTopUpPayment', () => {
  const charge = { amount_cents: 34900, currency: 'TRY', idempotency_key: 'topup_ai_100_1' }
  it('accepts an exact provider capture', () => expect(verifyTopUpPayment(charge, { paidAmountCents: 34900, paidCurrency: 'TRY', orderRef: 'topup_ai_100_1' }).ok).toBe(true))
  it.each([undefined, 9999, 10001])('fails closed for missing or wrong paidPrice: %s', (paidAmountCents) => {
    expect(verifyTopUpPayment(charge, { paidAmountCents, paidCurrency: 'TRY', orderRef: 'topup_100_1' }).ok).toBe(false)
  })
  it('requires the provider order reference', () => {
    expect(verifyTopUpPayment(charge, { paidAmountCents: 10000, paidCurrency: 'TRY' }).ok).toBe(false)
  })
})
