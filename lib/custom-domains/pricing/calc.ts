/**
 * Pure domain pricing math. No I/O, no env, no clock reads except through the
 * injected `now`, so every rule below is unit-testable with fixed inputs.
 *
 * All money is integer minor units (kuruş / cents). FX rates are integer
 * micro-units ("1 USD = 38_500_000 micro-TRY"), so no floating point is ever
 * involved in a monetary result. Every step rounds half-up to the minor unit.
 */

export const PRICING_VERSION = 1
/** Retail markup over the TL cost: 50.00% expressed in basis points. */
export const MARGIN_BPS = 5000
/** A daily rate older than this is treated as unusable (daily refresh + slack). */
export const MAX_RATE_AGE_MS = 36 * 60 * 60 * 1000
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
export const MAX_PERIOD_YEARS = 10
const BPS = BigInt(10000)
const MICROS = BigInt(1000000)

/** Source label for the manually fixed rate. It is NOT a market rate. */
export const FIXED_RATE_SOURCE = 'fixed_manual_rate'
/** Fixed, server-side only: 1 USD = 50 TRY. Not the current market rate. */
export const FIXED_USD_TRY_RATE_MICROS = 50_000_000
/** Server-side VAT default (20%) used when DOMAIN_VAT_RATE_PERCENT is unset. */
export const DEFAULT_VAT_BPS = 2000

export type FxRate = {
  currency: string
  /** TRY per 1 unit of `currency`, in millionths. Must be a positive safe integer. */
  rateMicros: number
  source: string
  /** ISO timestamp the rate was published/fetched. */
  fetchedAt: string
  /** `fixed` rates are manual constants and skip the live-rate age check. Default `live`. */
  kind?: 'live' | 'fixed'
}

/** The only FX rates the server knows. EUR and others are deliberately absent. */
export function getFixedRates(now: Date): Record<string, FxRate> {
  return {
    USD: {
      currency: 'USD',
      rateMicros: FIXED_USD_TRY_RATE_MICROS,
      source: FIXED_RATE_SOURCE,
      fetchedAt: now.toISOString(),
      kind: 'fixed',
    },
  }
}

export type PricingFailure =
  | 'INVALID_COST'
  | 'INVALID_CURRENCY'
  | 'INVALID_PERIOD'
  | 'FX_MISSING'
  | 'FX_INVALID'
  | 'FX_STALE'
  | 'VAT_MISSING'
  | 'VAT_INVALID'

/** Everything needed to audit (and reproduce) a sale price. Persisted on the order. */
export type DomainPriceSnapshot = {
  version: number
  periodYears: number
  providerCostMinor: number
  providerCurrency: string
  fxRateMicros: number
  fxSource: string
  fxFetchedAt: string
  /** TL cost for the whole period. */
  costTryMinor: number
  marginBps: number
  /** VAT-exclusive sale price for the whole period. */
  netTryMinor: number
  vatBps: number
  vatTryMinor: number
  /** Amount charged to the customer (net + VAT), in TRY minor units. */
  grossTryMinor: number
  /** Per-year VAT-exclusive price, used for display. */
  unitNetTryMinor: number
  unitVatTryMinor: number
  unitGrossTryMinor: number
  /** Renewal is intentionally NOT derived from the registration price. */
  renewal: null
  computedAt: string
}

export type QuoteResult = { ok: true; snapshot: DomainPriceSnapshot } | { ok: false; reason: PricingFailure }

/** The only price shape the browser ever receives: TRY, per year, VAT shown separately. */
export type DomainQuoteView = {
  currency: 'TRY'
  netMinor: number
  vatMinor: number
  grossMinor: number
  vatBps: number
}

/** Registrar availability row after pricing; never carries the provider's currency/cost. */
export type PricedDomainResult = {
  domain: string
  tld: string
  status: 'available' | 'unavailable' | 'unknown'
  quote: DomainQuoteView | null
}

/** Integer division rounded half-up (operands are non-negative here). */
export function roundDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator * BigInt(2) + denominator) / (denominator * BigInt(2))
}

export function isSafePositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/** "20" or "18.5" -> basis points. Returns null for anything that is not a sane percentage. */
export function parseVatPercentToBps(raw: string | undefined | null): number | null {
  if (!raw) return null
  const value = raw.trim()
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value)) return null
  const [whole, frac = ''] = value.split('.')
  const bps = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  return bps >= 0 && bps <= 10_000 ? bps : null
}

export type ComputeQuoteInput = {
  costMinor: number
  currency: string
  periodYears: number
  fx: FxRate | null | undefined
  vatBps: number | null | undefined
  now: Date
}

export function computeDomainQuote(input: ComputeQuoteInput): QuoteResult {
  const { costMinor, periodYears, fx, vatBps, now } = input
  const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : ''

  if (!isSafePositiveInt(costMinor)) return { ok: false, reason: 'INVALID_COST' }
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, reason: 'INVALID_CURRENCY' }
  if (!Number.isInteger(periodYears) || periodYears < 1 || periodYears > MAX_PERIOD_YEARS) {
    return { ok: false, reason: 'INVALID_PERIOD' }
  }
  if (vatBps === null || vatBps === undefined) return { ok: false, reason: 'VAT_MISSING' }
  if (!Number.isInteger(vatBps) || vatBps < 0 || vatBps > 10_000) return { ok: false, reason: 'VAT_INVALID' }

  let rateMicros: number
  let fxSource: string
  let fxFetchedAt: string
  if (currency === 'TRY') {
    rateMicros = Number(MICROS)
    fxSource = 'identity'
    fxFetchedAt = now.toISOString()
  } else {
    if (!fx || fx.currency.toUpperCase() !== currency) return { ok: false, reason: 'FX_MISSING' }
    if (!isSafePositiveInt(fx.rateMicros) || !fx.source) return { ok: false, reason: 'FX_INVALID' }
    const fetchedMs = Date.parse(fx.fetchedAt)
    if (!Number.isFinite(fetchedMs)) return { ok: false, reason: 'FX_INVALID' }
    const age = now.getTime() - fetchedMs
    if (age < -MAX_FUTURE_SKEW_MS) return { ok: false, reason: 'FX_INVALID' }
    if (fx.kind !== 'fixed' && age > MAX_RATE_AGE_MS) return { ok: false, reason: 'FX_STALE' }
    rateMicros = fx.rateMicros
    fxSource = fx.source
    fxFetchedAt = new Date(fetchedMs).toISOString()
  }

  // Provider price is per year; convert, mark up and tax one year, then scale
  // by the period so the displayed per-year price and the charged total agree.
  const unitCostTry = roundDiv(BigInt(costMinor) * BigInt(rateMicros), MICROS)
  const unitNet = unitCostTry + roundDiv(unitCostTry * BigInt(MARGIN_BPS), BPS)
  const unitVat = roundDiv(unitNet * BigInt(vatBps), BPS)
  const unitGross = unitNet + unitVat
  const years = BigInt(periodYears)

  const toSafe = (value: bigint): number => {
    const n = Number(value)
    if (!Number.isSafeInteger(n)) throw new RangeError('pricing_overflow')
    return n
  }

  try {
    const snapshot: DomainPriceSnapshot = {
      version: PRICING_VERSION,
      periodYears,
      providerCostMinor: costMinor,
      providerCurrency: currency,
      fxRateMicros: rateMicros,
      fxSource,
      fxFetchedAt,
      costTryMinor: toSafe(unitCostTry * years),
      marginBps: MARGIN_BPS,
      netTryMinor: toSafe(unitNet * years),
      vatBps,
      vatTryMinor: toSafe(unitVat * years),
      grossTryMinor: toSafe(unitGross * years),
      unitNetTryMinor: toSafe(unitNet),
      unitVatTryMinor: toSafe(unitVat),
      unitGrossTryMinor: toSafe(unitGross),
      renewal: null,
      computedAt: now.toISOString(),
    }
    if (snapshot.grossTryMinor <= 0) return { ok: false, reason: 'INVALID_COST' }
    return { ok: true, snapshot }
  } catch {
    return { ok: false, reason: 'INVALID_COST' }
  }
}

/** Per-year, VAT-exclusive view for search results and the purchase summary. */
export function toQuoteView(snapshot: DomainPriceSnapshot): DomainQuoteView {
  return {
    currency: 'TRY',
    netMinor: snapshot.unitNetTryMinor,
    vatMinor: snapshot.unitVatTryMinor,
    grossMinor: snapshot.unitGrossTryMinor,
    vatBps: snapshot.vatBps,
  }
}
