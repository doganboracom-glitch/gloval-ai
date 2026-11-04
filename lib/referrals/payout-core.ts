import type { ReferralPayoutMethod, ReferralTaxStatus } from './partner-types'

export const REFERRAL_PAYOUT_MIN_CENTS = 100_000
export const REFERRAL_CREDIT_VALUE_CENTS = 300

export type ReferralPayoutPreview = {
  method: ReferralPayoutMethod
  balanceCents: number
  payoutCents: number
  creditAmount: number | null
  systemTopupCents: number
  invoiceRequired: boolean
}

function toSafeNumber(value: bigint): number | null {
  const result = Number(value)
  return Number.isSafeInteger(result) ? result : null
}

export function calculateReferralCommissionCents(grossCents: number): {
  netCents: number
  commissionCents: number
} | null {
  if (!Number.isSafeInteger(grossCents) || grossCents <= 0) return null

  const gross = BigInt(grossCents)
  const netCents = (gross * 100n) / 120n
  const commissionCents = (netCents * 20n) / 100n
  const safeNet = toSafeNumber(netCents)
  const safeCommission = toSafeNumber(commissionCents)
  if (safeNet === null || safeCommission === null) return null

  return { netCents: safeNet, commissionCents: safeCommission }
}

export function calculateReferralPayoutPreview(
  balanceCents: number,
  method: ReferralPayoutMethod,
  taxStatus: ReferralTaxStatus | null,
): ReferralPayoutPreview | null {
  if (!Number.isSafeInteger(balanceCents) || balanceCents < REFERRAL_PAYOUT_MIN_CENTS) return null

  const balance = BigInt(balanceCents)
  if (method === 'cash') {
    if (taxStatus !== 'individual' && taxStatus !== 'company') return null
    const invoiceRequired = taxStatus === 'company'
    const payoutCents = invoiceRequired ? (balance * 120n + 50n) / 100n : balance
    const safePayout = toSafeNumber(payoutCents)
    if (safePayout === null) return null

    return {
      method,
      balanceCents,
      payoutCents: safePayout,
      creditAmount: null,
      systemTopupCents: 0,
      invoiceRequired,
    }
  }

  if (method !== 'credit') return null

  const creditValue = BigInt(REFERRAL_CREDIT_VALUE_CENTS)
  const creditAmount = (balance + creditValue - 1n) / creditValue
  const topupCents = creditAmount * creditValue - balance
  const safeCreditAmount = toSafeNumber(creditAmount)
  const safeTopup = toSafeNumber(topupCents)
  if (safeCreditAmount === null || safeTopup === null || safeCreditAmount < 1) return null

  return {
    method,
    balanceCents,
    payoutCents: balanceCents,
    creditAmount: safeCreditAmount,
    systemTopupCents: safeTopup,
    invoiceRequired: false,
  }
}

export function formatReferralTry(cents: number, locale: 'tr' | 'en'): string {
  const amount = (Number.isSafeInteger(cents) ? cents : 0) / 100
  return new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
