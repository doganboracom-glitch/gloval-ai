import { describe, expect, it } from 'vitest'
import {
  calculateReferralCommissionCents,
  calculateReferralCreditConversion,
  calculateReferralInvoiceBreakdown,
  calculateReferralPayoutPreview,
  formatReferralTry,
  formatReferralTryInput,
  parseReferralPayoutAmount,
  validateReferralPayoutAmount,
  REFERRAL_PAYOUT_MIN_CENTS,
} from './payout-core'
import { CREDIT_MIN_CENTS } from './commission-config'

const MINIMUM_PAYOUT_CENTS = REFERRAL_PAYOUT_MIN_CENTS

describe('referral payout math', () => {
  it('calculates commission from VAT-exclusive gross and floors to the kuruş', () => {
    expect(calculateReferralCommissionCents(12_105)).toEqual({
      netCents: 10_087,
      commissionCents: 2_017,
    })
    expect(calculateReferralCommissionCents(12_001)).toEqual({
      netCents: 10_000,
      commissionCents: 2_000,
    })
    expect(calculateReferralCommissionCents(0)).toBeNull()
  })

  it('rounds credit conversions up and caps each system contribution below three lira', () => {
    expect(calculateReferralCreditConversion(100)).toEqual({
      creditAmount: 1,
      systemTopupCents: 200,
    })
    expect(calculateReferralCreditConversion(300)).toEqual({
      creditAmount: 1,
      systemTopupCents: 0,
    })
    expect(calculateReferralCreditConversion(882)).toEqual({
      creditAmount: 3,
      systemTopupCents: 18,
    })
    expect(calculateReferralCreditConversion(900)).toEqual({
      creditAmount: 3,
      systemTopupCents: 0,
    })
    expect(calculateReferralCreditConversion(100_001)).toEqual({
      creditAmount: 334,
      systemTopupCents: 199,
    })
    expect(calculateReferralCreditConversion(-1)).toBeNull()
  })

  it('applies separate total-credit and available-cash minimums', () => {
    expect(CREDIT_MIN_CENTS).toBe(300)
    expect(calculateReferralPayoutPreview(CREDIT_MIN_CENTS - 1, 'credit', 'individual')).toBeNull()
    expect(calculateReferralPayoutPreview(CREDIT_MIN_CENTS, 'credit', 'individual')).toMatchObject({
      balanceCents: 300,
      payoutCents: 300,
      creditAmount: 1,
      systemTopupCents: 0,
    })
    expect(calculateReferralPayoutPreview(MINIMUM_PAYOUT_CENTS - 1, 'cash', 'individual')).toBeNull()
    expect(calculateReferralPayoutPreview(MINIMUM_PAYOUT_CENTS, 'cash', 'individual')).toMatchObject({
      balanceCents: MINIMUM_PAYOUT_CENTS,
      payoutCents: MINIMUM_PAYOUT_CENTS,
    })
  })

  it('requires an explicit company VAT mode and keeps individual cash amounts unchanged', () => {
    expect(calculateReferralPayoutPreview(MINIMUM_PAYOUT_CENTS, 'cash', 'company')).toBeNull()
    expect(calculateReferralPayoutPreview(MINIMUM_PAYOUT_CENTS, 'cash', 'company', { vatMode: 'added' })).toMatchObject({
      balanceCents: MINIMUM_PAYOUT_CENTS,
      payoutCents: 120_000,
      vatMode: 'added',
      invoiceRequired: true,
      invoiceNetCents: 100_000,
      invoiceVatCents: 20_000,
      invoiceGrossCents: 120_000,
    })
    expect(calculateReferralPayoutPreview(MINIMUM_PAYOUT_CENTS, 'cash', 'company', { vatMode: 'included' })).toMatchObject({
      payoutCents: MINIMUM_PAYOUT_CENTS,
      invoiceRequired: true,
      invoiceNetCents: 83_333,
      invoiceVatCents: 16_667,
      invoiceGrossCents: 100_000,
    })
    expect(calculateReferralPayoutPreview(MINIMUM_PAYOUT_CENTS, 'cash', 'individual')).toMatchObject({
      balanceCents: MINIMUM_PAYOUT_CENTS,
      payoutCents: MINIMUM_PAYOUT_CENTS,
      invoiceRequired: false,
    })
    expect(calculateReferralPayoutPreview(100_001, 'cash', 'company', { vatMode: 'added' })?.payoutCents).toBe(120_001)
  })

  it('parses Turkish and English TL input into integer kuruş without floating-point math', () => {
    expect(parseReferralPayoutAmount('1.234,50')).toBe(123_450)
    expect(parseReferralPayoutAmount('1234.50')).toBe(123_450)
    expect(parseReferralPayoutAmount('1,234.50')).toBe(123_450)
    expect(parseReferralPayoutAmount('1.234')).toBe(123_400)
    expect(parseReferralPayoutAmount('12,5')).toBe(1_250)
    expect(parseReferralPayoutAmount('12,345')).toBeNull()
    expect(parseReferralPayoutAmount('-1.00')).toBeNull()
    expect(parseReferralPayoutAmount('0.00')).toBeNull()
    expect(formatReferralTryInput(123_450, 'tr')).toBe('1.234,50')
    expect(formatReferralTryInput(123_450, 'en')).toBe('1,234.50')
  })

  it('validates payout bounds and prevents partial credit withdrawals while a debt bucket exists', () => {
    expect(validateReferralPayoutAmount(100_000, 250_000, 'cash')).toBeNull()
    expect(validateReferralPayoutAmount(99_999, 250_000, 'cash')).toBe('minimum_not_met')
    expect(validateReferralPayoutAmount(250_001, 250_000, 'cash')).toBe('amount_exceeds_balance')
    expect(validateReferralPayoutAmount(300, 1_000, 'credit', true)).toBe('partial_unavailable_debt')
    expect(validateReferralPayoutAmount(1_000, 1_000, 'credit', true)).toBeNull()
    expect(calculateReferralPayoutPreview(1_000, 'credit', 'individual', { amountCents: 600 })).toMatchObject({
      balanceCents: 600,
      partial: true,
      creditAmount: 2,
      systemTopupCents: 0,
    })
  })

  it('calculates both company VAT modes with integer half-up rounding', () => {
    expect(calculateReferralInvoiceBreakdown(100_005, 'included')).toEqual({
      payoutCents: 100_005,
      invoiceNetCents: 83_338,
      invoiceVatCents: 16_667,
      invoiceGrossCents: 100_005,
    })
    expect(calculateReferralInvoiceBreakdown(100_005, 'added')).toEqual({
      payoutCents: 120_006,
      invoiceNetCents: 100_005,
      invoiceVatCents: 20_001,
      invoiceGrossCents: 120_006,
    })
  })

  it('formats Turkish payout amounts as a TL suffix', () => {
    expect(formatReferralTry(12_105, 'tr')).toBe('121,05 TL')
  })
})
