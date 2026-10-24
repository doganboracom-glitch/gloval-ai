import { parseTopUpOrderRef, type CreditTopUp } from '@/lib/pricing-config'
import { verifyPaidFacts } from './paid-facts'

export type TopUpChargeRow = {
  amount_cents: number
  currency: string
  idempotency_key: string | null
}

export type TopUpPaymentFacts = {
  paidAmountCents?: number
  paidCurrency?: string
  orderRef?: string
}

export type TopUpVerdict =
  | { ok: true; pack: CreditTopUp }
  | { ok: false; reason: 'unknown_pack' | 'ledger_mismatch' | 'amount_mismatch' | 'currency_mismatch' | 'order_mismatch' }

/**
 * Decides whether a provider-verified "paid" result may release credits for a
 * pending top-up charge. The pack (and so the credit amount) is derived ONLY
 * from the server-written idempotency key and the server-side catalog; the
 * amount the provider says was captured must equal the catalog price.
 * Provider fields are optional because not every provider echoes them back —
 * when present they must match, when absent the server-side row is the truth.
 */
export function verifyTopUpPayment(
  charge: TopUpChargeRow,
  facts: TopUpPaymentFacts,
): TopUpVerdict {
  const pack = parseTopUpOrderRef(charge.idempotency_key)
  if (!pack) return { ok: false, reason: 'unknown_pack' }

  if (charge.amount_cents !== pack.priceCents || charge.currency.toUpperCase() !== pack.currency) {
    return { ok: false, reason: 'ledger_mismatch' }
  }
  const verdict = verifyPaidFacts(
    {
      amountCents: pack.priceCents,
      currency: pack.currency,
      orderRef: charge.idempotency_key ?? undefined,
    },
    facts,
    { require: 'when_present' },
  )
  if (!verdict.ok) {
    return { ok: false, reason: verdict.reason as 'amount_mismatch' | 'currency_mismatch' | 'order_mismatch' }
  }
  return { ok: true, pack }
}
