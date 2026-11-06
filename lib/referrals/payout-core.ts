import type { ReferralPayoutMethod, ReferralTaxStatus, ReferralVatMode } from './partner-types'
import {
  REFERRAL_AMOUNT_MAX_DECIMALS,
  REFERRAL_COMMISSION_RATE_PERCENT,
  REFERRAL_CURRENCY_MINOR_UNITS,
  REFERRAL_MAX_CREDIT_TOPUP_CENTS,
  REFERRAL_PAYOUT_MIN_CENTS,
  REFERRAL_VAT_RATE_PERCENT,
  TRY_PER_CREDIT_CENTS,
} from './commission-config'

export { REFERRAL_CREDIT_VALUE_CENTS, REFERRAL_PAYOUT_MIN_CENTS, TRY_PER_CREDIT_CENTS } from './commission-config'

export type ReferralPayoutAmountError =
  | 'invalid_amount'
  | 'credit_balance_empty'
  | 'partial_credit_must_be_multiple'
  | 'minimum_not_met'
  | 'amount_exceeds_balance'
  | 'partial_unavailable_debt'

export type ReferralInvoiceBreakdown = {
  payoutCents: number
  invoiceNetCents: number
  invoiceVatCents: number
  invoiceGrossCents: number
}

export type ReferralPayoutPreview = {
  method: ReferralPayoutMethod
  balanceCents: number
  maximumCents: number
  partial: boolean
  payoutCents: number
  creditAmount: number | null
  systemTopupCents: number
  invoiceRequired: boolean
  vatMode: ReferralVatMode | null
  invoiceNetCents: number | null
  invoiceVatCents: number | null
  invoiceGrossCents: number | null
}

type ReferralPayoutPreviewOptions = {
  amountCents?: number | null
  vatMode?: ReferralVatMode | null
  hasDebtBucket?: boolean
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

  const scaled = BigInt(value) * BigInt(numerator)
  const divisor = BigInt(denominator)
  const result = round ? (scaled + divisor / BigInt(2)) / divisor : scaled / divisor
  const parsed = Number(result)
  return Number.isSafeInteger(parsed) ? parsed : null
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

export function calculateReferralInvoiceBreakdown(
  balanceCents: number,
  vatMode: ReferralVatMode,
): ReferralInvoiceBreakdown | null {
  if (!Number.isSafeInteger(balanceCents) || balanceCents < 0) return null

  if (vatMode === 'included') {
    const invoiceNetCents = ratioAmount(balanceCents, 100, 100 + REFERRAL_VAT_RATE_PERCENT, true)
    if (invoiceNetCents === null) return null
    const invoiceVatCents = balanceCents - invoiceNetCents
    return {
      payoutCents: balanceCents,
      invoiceNetCents,
      invoiceVatCents,
      invoiceGrossCents: balanceCents,
    }
  }

  if (vatMode === 'added') {
    const invoiceVatCents = ratioAmount(balanceCents, REFERRAL_VAT_RATE_PERCENT, 100, true)
    if (invoiceVatCents === null) return null
    const invoiceGrossCents = balanceCents + invoiceVatCents
    if (!Number.isSafeInteger(invoiceGrossCents)) return null
    return {
      payoutCents: invoiceGrossCents,
      invoiceNetCents: balanceCents,
      invoiceVatCents,
      invoiceGrossCents,
    }
  }

  return null
}

export function parseReferralPayoutAmount(value: string): number | null {
  const input = value.trim()
  if (!input || /\s/u.test(input) || !/^\d[\d.,]*$/u.test(input)) return null

  const commaIndex = input.lastIndexOf(',')
  const dotIndex = input.lastIndexOf('.')
  let wholePart = input
  let fractionPart = ''
  let groupingSeparator: ',' | '.' | null = null

  if (commaIndex !== -1 && dotIndex !== -1) {
    const decimalSeparator = commaIndex > dotIndex ? ',' : '.'
    groupingSeparator = decimalSeparator === ',' ? '.' : ','
    const decimalIndex = Math.max(commaIndex, dotIndex)
    wholePart = input.slice(0, decimalIndex)
    fractionPart = input.slice(decimalIndex + 1)
    if (!/^\d{1,2}$/u.test(fractionPart)) return null
  } else if (commaIndex !== -1 || dotIndex !== -1) {
    const separator: ',' | '.' = commaIndex !== -1 ? ',' : '.'
    const parts = input.split(separator)
  if (parts.length > 2) {
    if (!/^\d{1,3}(?:[.,]\d{3})+$/u.test(input)) return null
    wholePart = input
    groupingSeparator = separator
  } else {
    const [whole, fraction = ''] = parts
    if (separator === '.' && fraction.length === 3 && /^\d{1,3}(?:\.\d{3})+$/u.test(input)) {
      wholePart = input
      groupingSeparator = separator
    } else {
        wholePart = whole
        fractionPart = fraction
        if (!/^\d{1,2}$/u.test(fractionPart)) return null
      }
    }
  }

  if (groupingSeparator && wholePart.includes(groupingSeparator)) {
    const pattern = groupingSeparator === ',' ? /^\d{1,3}(?:,\d{3})+$/u : /^\d{1,3}(?:\.\d{3})+$/u
    if (!pattern.test(wholePart)) return null
  } else if (!/^\d+$/u.test(wholePart)) {
    return null
  }

  const wholeDigits = wholePart.replace(/[.,]/gu, '')
  const fractionDigits = fractionPart.padEnd(REFERRAL_AMOUNT_MAX_DECIMALS, '0')
  try {
    const cents = BigInt(wholeDigits) * BigInt(REFERRAL_CURRENCY_MINOR_UNITS) + BigInt(fractionDigits || '0')
    if (cents <= BigInt(0) || cents > BigInt(Number.MAX_SAFE_INTEGER)) return null
    return Number(cents)
  } catch {
    return null
  }
}

export function validateReferralPayoutAmount(
  amountCents: number | null | undefined,
  maximumCents: number,
  method: ReferralPayoutMethod,
  hasDebtBucket = false,
): ReferralPayoutAmountError | null {
  if (!Number.isSafeInteger(maximumCents) || maximumCents < 0) return 'invalid_amount'
  const selectedCents = amountCents == null ? maximumCents : amountCents

  if (!Number.isSafeInteger(selectedCents)) return 'invalid_amount'
  if (selectedCents > maximumCents) return 'amount_exceeds_balance'
  if (selectedCents <= 0) return method === 'cash' ? 'minimum_not_met' : 'credit_balance_empty'
  if (method === 'cash' && selectedCents < REFERRAL_PAYOUT_MIN_CENTS) return 'minimum_not_met'
  if (method === 'credit' && selectedCents < maximumCents && selectedCents % TRY_PER_CREDIT_CENTS !== 0) {
    return 'partial_credit_must_be_multiple'
  }
  if (method === 'credit' && hasDebtBucket && selectedCents < maximumCents) {
    return 'partial_unavailable_debt'
  }
  return null
}

export function calculateReferralPayoutPreview(
  maximumCents: number,
  method: ReferralPayoutMethod,
  taxStatus: ReferralTaxStatus | null,
  options: ReferralPayoutPreviewOptions = {},
): ReferralPayoutPreview | null {
  if (method !== 'cash' && method !== 'credit') return null
  const amountCents = options.amountCents ?? maximumCents
  if (validateReferralPayoutAmount(amountCents, maximumCents, method, options.hasDebtBucket) !== null) return null
  const partial = amountCents < maximumCents

  if (method === 'cash') {
    if (taxStatus !== 'individual' && taxStatus !== 'company') return null
    const invoiceRequired = taxStatus === 'company'
    if (invoiceRequired) {
      if (options.vatMode !== 'included' && options.vatMode !== 'added') return null
      const invoice = calculateReferralInvoiceBreakdown(amountCents, options.vatMode)
      if (!invoice) return null
      return {
        method,
        balanceCents: amountCents,
        maximumCents,
        partial,
        payoutCents: invoice.payoutCents,
        creditAmount: null,
        systemTopupCents: 0,
        invoiceRequired,
        vatMode: options.vatMode,
        invoiceNetCents: invoice.invoiceNetCents,
        invoiceVatCents: invoice.invoiceVatCents,
        invoiceGrossCents: invoice.invoiceGrossCents,
      }
    }
    if (options.vatMode != null) return null

    return {
      method,
      balanceCents: amountCents,
      maximumCents,
      partial,
      payoutCents: amountCents,
      creditAmount: null,
      systemTopupCents: 0,
      invoiceRequired: false,
      vatMode: null,
      invoiceNetCents: null,
      invoiceVatCents: null,
      invoiceGrossCents: null,
    }
  }

  if (options.vatMode != null) return null
  const conversion = calculateReferralCreditConversion(amountCents)
  if (!conversion || conversion.creditAmount < 1) return null

  return {
    method,
    balanceCents: amountCents,
    maximumCents,
    partial,
    payoutCents: amountCents,
    creditAmount: conversion.creditAmount,
    systemTopupCents: conversion.systemTopupCents,
    invoiceRequired: false,
    vatMode: null,
    invoiceNetCents: null,
    invoiceVatCents: null,
    invoiceGrossCents: null,
  }
}

function formattedCents(cents: number, locale: 'tr' | 'en') {
  const safeCents = Number.isSafeInteger(cents) ? cents : 0
  const absoluteCents = BigInt(Math.abs(safeCents))
  const whole = Number(absoluteCents / BigInt(REFERRAL_CURRENCY_MINOR_UNITS))
  const fraction = String(absoluteCents % BigInt(REFERRAL_CURRENCY_MINOR_UNITS)).padStart(2, '0')
  const groupedWhole = new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(whole)
  const decimalSeparator = locale === 'tr' ? ',' : '.'
  return `${safeCents < 0 ? '-' : ''}${groupedWhole}${decimalSeparator}${fraction}`
}

export function formatReferralTry(cents: number, locale: 'tr' | 'en'): string {
  const formatted = formattedCents(cents, locale)
  return locale === 'tr' ? `${formatted} TL` : `TRY ${formatted}`
}

export function formatReferralTryInput(cents: number, locale: 'tr' | 'en'): string {
  return formattedCents(cents, locale)
}
