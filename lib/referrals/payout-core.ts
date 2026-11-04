import type { ReferralPayoutMethod, ReferralTaxStatus } from './partner-types'
import {
  CREDIT_MIN_CENTS,
  REFERRAL_COMMISSION_RATE_PERCENT,
  REFERRAL_MAX_CREDIT_TOPUP_CENTS,
  REFERRAL_PAYOUT_MIN_CENTS,
  REFERRAL_VAT_RATE_PERCENT,
  TRY_PER_CREDIT_CENTS,
} from './commission-config'

export { CREDIT_MIN_CENTS, REFERRAL_CREDIT_VALUE_CENTS, REFERRAL_PAYOUT_MIN_CENTS, TRY_PER_CREDIT_CENTS } from './commission-config'

export type ReferralPayoutPreview = {
  method: ReferralPayoutMethod
  balanceCents: number
  payoutCents: number
  creditAmount: number | null
  systemTopupCents: number
  invoiceRequired: boolean
}

function ratioAmount(value: number, numerator: number, denominator: number, round = false): number | null {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Number.isSafeInteger(numerator) ||
    numerator < 0 ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0
  ) return null

  const whole = Math.floor(value / denominator)
  const remainder = value % denominator
  const scaledWhole = whole * numerator
  const scaledRemainder = remainder * numerator
  const roundedRemainder = round
    ? Math.floor((scaledRemainder + Math.floor(denominator / 2)) / denominator)
    : Math.floor(scaledRemainder / denominator)
  const result = scaledWhole + roundedRemainder
  return Number.isSafeInteger(result) ? result : null
}

export function calculateReferralCommissionCents(grossCents: number): {
  netCents: number
  commissionCents: number
} | null {
  if (!Number.isSafeInteger(grossCents) || grossCents <= 0) return null

  const netCents = ratioAmount(grossCents, 100, 100 + REFERRAL_VAT_RATE_PERCENT)
  if (netCents === null) return null
  const commissionCents = ratioAmount(netCents, REFERRAL_COMMISSION_RATE_PERCENT, 100)
  if (commissionCents === null) return null

  return { netCents, commissionCents }
}

export function calculateReferralCreditConversion(balanceCents: number): {
  creditAmount: number
  systemTopupCents: number
} | null {
  if (!Number.isSafeInteger(balanceCents) || balanceCents < 0) return null

  const remainder = balanceCents % TRY_PER_CREDIT_CENTS
  const creditAmount = Math.floor(balanceCents / TRY_PER_CREDIT_CENTS) + (remainder > 0 ? 1 : 0)
  const systemTopupCents = remainder > 0 ? TRY_PER_CREDIT_CENTS - remainder : 0
  if (!Number.isSafeInteger(creditAmount) || systemTopupCents > REFERRAL_MAX_CREDIT_TOPUP_CENTS) return null

  return { creditAmount, systemTopupCents }
}

export function calculateReferralPayoutPreview(
  balanceCents: number,
  method: ReferralPayoutMethod,
  taxStatus: ReferralTaxStatus | null,
): ReferralPayoutPreview | null {
  if (method !== 'cash' && method !== 'credit') return null

  const minimumCents = method === 'cash' ? REFERRAL_PAYOUT_MIN_CENTS : CREDIT_MIN_CENTS
  if (!Number.isSafeInteger(balanceCents) || balanceCents < minimumCents) return null

  if (method === 'cash') {
    if (taxStatus !== 'individual' && taxStatus !== 'company') return null
    const invoiceRequired = taxStatus === 'company'
    const payoutCents = invoiceRequired ? ratioAmount(balanceCents, 100 + REFERRAL_VAT_RATE_PERCENT, 100, true) : balanceCents
    if (payoutCents === null) return null

    return {
      method,
      balanceCents,
      payoutCents,
      creditAmount: null,
      systemTopupCents: 0,
      invoiceRequired,
    }
  }

  if (method !== 'credit') return null

  const conversion = calculateReferralCreditConversion(balanceCents)
  if (!conversion || conversion.creditAmount < 1) return null

  return {
    method,
    balanceCents,
    payoutCents: balanceCents,
    creditAmount: conversion.creditAmount,
    systemTopupCents: conversion.systemTopupCents,
    invoiceRequired: false,
  }
}

export function formatReferralTry(cents: number, locale: 'tr' | 'en'): string {
  const amount = (Number.isSafeInteger(cents) ? cents : 0) / 100
  const formatted = new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return locale === 'tr' ? `${formatted} TL` : `TRY ${formatted}`
}
