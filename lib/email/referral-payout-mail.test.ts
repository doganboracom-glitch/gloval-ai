import { describe, expect, it } from 'vitest'
import { buildReferralPayoutNoticeEmail } from './referral-payout-mail'

describe('referral payout email details', () => {
  it('includes the cash amount mode and invoice breakdown in Turkish partner notices', () => {
    const email = buildReferralPayoutNoticeEmail({
      lang: 'tr',
      type: 'referral_cash_requested',
      requestReference: 'request-123',
      amountCents: 120_006,
      commissionCents: 100_005,
      partial: true,
      invoiceRequired: true,
      vatMode: 'added',
      invoiceNetCents: 100_005,
      invoiceVatCents: 20_001,
      invoiceGrossCents: 120_006,
    })

    expect(email.text).toContain('Kısmi tutar')
    expect(email.text).toContain('KDV modu')
    expect(email.text).toContain('KDV tutara eklendi')
    expect(email.text).toContain('1.000,05 TL')
    expect(email.text).toContain('200,01 TL')
    expect(email.text).toContain('1.200,06 TL')
  })

  it('includes VAT mode and kuruş amounts in English administrator notices', () => {
    const email = buildReferralPayoutNoticeEmail({
      lang: 'en',
      type: 'referral_cash_admin',
      requestReference: 'request-456',
      amountCents: 120_006,
      commissionCents: 100_005,
      partial: true,
      invoiceRequired: true,
      vatMode: 'added',
      invoiceNetCents: 100_005,
      invoiceVatCents: 20_001,
      invoiceGrossCents: 120_006,
    })

    expect(email.text).toContain('Partial amount')
    expect(email.text).toContain('VAT mode')
    expect(email.text).toContain('VAT added on top')
    expect(email.text).toContain('TRY 1,000.05')
    expect(email.text).toContain('TRY 200.01')
    expect(email.text).toContain('TRY 1,200.06')
  })

  it('includes the commission amount and partial marker for credit conversions', () => {
    const email = buildReferralPayoutNoticeEmail({
      lang: 'en',
      type: 'referral_credit_converted',
      commissionCents: 10_001,
      partial: true,
      creditAmount: 34,
      systemTopupCents: 199,
    })

    expect(email.text).toContain('Commission balance used')
    expect(email.text).toContain('Partial amount')
    expect(email.text).toContain('TRY 100.01')
    expect(email.text).toContain('34')
    expect(email.text).toContain('TRY 1.99')
  })
})
