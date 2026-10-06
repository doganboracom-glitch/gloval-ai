import {
  computeDomainQuote,
  toQuoteView,
  type DomainPriceSnapshot,
  type FxRate,
  type PricedDomainResult,
  type PricingFailure,
} from './calc'

/**
 * Server-trusted pricing for a registrar availability row. The single entry
 * point used by search results, the purchase summary and order creation, so
 * all three always agree. Callers pass ONLY server-derived values: there is
 * deliberately no parameter for a client-supplied price, rate, margin or VAT.
 */

export type PricingContext = {
  vatBps: number | null
  /** Latest known rate per currency code, keyed upper-case. */
  rates: Record<string, FxRate>
}

export type RegistrarPriceInput = { registerCents: number; currency: string }

export type OrderPricing =
  | {
      ok: true
      snapshot: DomainPriceSnapshot
      /** Columns to persist on `domain_orders`. */
      orderFields: { price_cents: number; currency: 'TRY'; price_snapshot: DomainPriceSnapshot }
      /** Exactly what the payment provider is asked to charge. */
      paymentAmount: { amountCents: number; currency: 'TRY' }
    }
  | { ok: false; reason: PricingFailure }

export function resolveOrderPricing(input: {
  price: RegistrarPriceInput
  periodYears: number
  context: PricingContext
  now?: Date
}): OrderPricing {
  const { price, periodYears, context } = input
  const currency = (price.currency ?? '').trim().toUpperCase()
  const quote = computeDomainQuote({
    costMinor: price.registerCents,
    currency,
    periodYears,
    fx: context.rates[currency],
    vatBps: context.vatBps,
    now: input.now ?? new Date(),
  })
  if (!quote.ok) return quote

  const { snapshot } = quote
  return {
    ok: true,
    snapshot,
    orderFields: { price_cents: snapshot.grossTryMinor, currency: 'TRY', price_snapshot: snapshot },
    paymentAmount: { amountCents: snapshot.grossTryMinor, currency: 'TRY' },
  }
}

/** Prices every search row (1 year). Rows that cannot be priced get `quote: null`. */
export function priceAvailabilityRows(
  rows: { domain: string; tld: string; status: PricedDomainResult['status']; price: RegistrarPriceInput | null }[],
  context: PricingContext,
  now: Date = new Date(),
): PricedDomainResult[] {
  return rows.map((row) => {
    const priced = row.price
      ? resolveOrderPricing({ price: row.price, periodYears: 1, context, now })
      : null
    return {
      domain: row.domain,
      tld: row.tld,
      status: row.status,
      quote: priced?.ok ? toQuoteView(priced.snapshot) : null,
    }
  })
}
