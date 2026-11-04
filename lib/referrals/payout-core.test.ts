import { describe, expect, it } from 'vitest'
import {
  calculateReferralCommissionCents,
  calculateReferralCreditConversion,
  calculateReferralPayoutPreview,
  formatReferralTry,
} from './payout-core'

const MINIMUM_PAYOUT_CENTS = 100_000

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

  it('requires the minimum available balance before allowing either payout method', () => {
    expect(calculateReferralPayoutPreview(MINIMUM_PAYOUT_CENTS - 1, 'credit', 'individual')).toBeNull()
    expect(calculateReferralPayoutPreview(MINIMUM_PAYOUT_CENTS, 'credit', 'individual')).toMatchObject({
      creditAmount: 334,
      systemTopupCents: 200,
    })
  })

  it('includes VAT in company cash payouts and leaves individual payouts unchanged', () => {
    expect(calculateReferralPayoutPreview(MINIMUM_PAYOUT_CENTS, 'cash', 'company')).toMatchObject({
      balanceCents: MINIMUM_PAYOUT_CENTS,
      payoutCents: 120_000,
      invoiceRequired: true,
    })
    expect(calculateReferralPayoutPreview(MINIMUM_PAYOUT_CENTS, 'cash', 'individual')).toMatchObject({
      balanceCents: MINIMUM_PAYOUT_CENTS,
      payoutCents: MINIMUM_PAYOUT_CENTS,
      invoiceRequired: false,
    })
    expect(calculateReferralPayoutPreview(100_001, 'cash', 'company')?.payoutCents).toBe(120_001)
  })

  it('formats Turkish payout amounts as a TL suffix', () => {
    expect(formatReferralTry(12_105, 'tr')).toBe('121,05 TL')
  })
})
