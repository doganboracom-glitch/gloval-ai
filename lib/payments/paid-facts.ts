/**
 * Single comparison of what the PSP says it captured against what the server
 * wrote down before the buyer was sent to pay. Every flow that releases a paid
 * right on a one-time charge (per-site entitlements such as Copyright Kaldırma
 * and Çoklu Dil, mail/AI add-on purchases, AI credit top-ups) goes through this
 * function so the rule cannot drift between them.
 *
 * Amounts are compared in minor units with strict equality: no tolerance, so
 * one kuruş too little or too much is a mismatch.
 */

export type PaidFacts = {
  paidAmountCents?: number
  paidCurrency?: string
  orderRef?: string
}

export type ExpectedCharge = {
  amountCents: number
  currency: string
  /** Basket/conversation id the order was created with. */
  orderRef?: string
}

export type PaidFactsRejection =
  | 'unverified_payment'
  | 'amount_mismatch'
  | 'currency_mismatch'
  | 'order_mismatch'

export type PaidFactsVerdict = { ok: true } | { ok: false; reason: PaidFactsRejection }

export type PaidFactsOptions = {
  /**
   * `all`: amount, currency and order ref must all be present (the provider
   * response must be able to prove the charge).
   * `amount_and_currency`: amount and currency must be present; the order ref
   * is compared only when the provider echoes it.
   * `when_present`: each fact is compared only when present.
   */
  require: 'all' | 'amount_and_currency' | 'when_present'
}

export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase().replace('TL', 'TRY')
}

export function verifyPaidFacts(
  expected: ExpectedCharge,
  facts: PaidFacts,
  options: PaidFactsOptions,
): PaidFactsVerdict {
  const needsAmountAndCurrency = options.require !== 'when_present'
  const needsOrderRef = options.require === 'all'

  if (needsAmountAndCurrency && (facts.paidAmountCents === undefined || facts.paidCurrency === undefined)) {
    return { ok: false, reason: 'unverified_payment' }
  }
  if (needsOrderRef && facts.orderRef === undefined) {
    return { ok: false, reason: 'unverified_payment' }
  }

  if (facts.orderRef !== undefined && expected.orderRef !== undefined && facts.orderRef !== expected.orderRef) {
    return { ok: false, reason: 'order_mismatch' }
  }
  if (facts.paidAmountCents !== undefined && facts.paidAmountCents !== expected.amountCents) {
    return { ok: false, reason: 'amount_mismatch' }
  }
  if (facts.paidCurrency !== undefined && normalizeCurrency(facts.paidCurrency) !== normalizeCurrency(expected.currency)) {
    return { ok: false, reason: 'currency_mismatch' }
  }
  return { ok: true }
}
