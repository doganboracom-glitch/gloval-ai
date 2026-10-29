import type { PricedDomainResult } from '../pricing/calc'
import { RegistrarError, type DomainAvailabilityResult } from '../registrar/types'
import type { TtlCache } from './cache'
import {
  checkBlocked,
  checkSearchLimits,
  identityFor,
  recordStrike,
  type LimiterDeps,
} from './limits'
import { PUBLIC_SEARCH_TLDS, parsePublicSearchQuery, type PublicSearchTld } from './validate'

/**
 * Orchestrates one public search: gate -> abuse checks -> input validation ->
 * (cached) registrar lookup -> server-side pricing. All I/O comes in through
 * `PublicSearchDeps`, which keeps this module unit-testable.
 *
 * Whatever leaves this module is a fixed, whitelisted shape (domain, tld,
 * status, TRY quote). Registrar errors collapse to a code; their messages,
 * payloads and cost/currency never reach the caller.
 */

export type PublicSearchErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_QUERY'
  | 'UNSUPPORTED_TLD'
  | 'RATE_LIMITED'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'PROVIDER_ERROR'

export type PublicSearchResponse =
  | { ok: true; results: PricedDomainResult[]; pricingAvailable: boolean }
  | { ok: false; error: PublicSearchErrorCode; retryAfterSeconds?: number }

export type PublicSearchDeps = {
  isOpen: () => boolean
  fetchAvailability: (label: string, tld: PublicSearchTld | null) => Promise<DomainAvailabilityResult[]>
  priceRows: (rows: DomainAvailabilityResult[]) => Promise<PricedDomainResult[]>
  limiter: LimiterDeps
  cache: TtlCache<DomainAvailabilityResult[]>
}

export async function runPublicDomainSearch(
  input: { query: unknown; ip: string | null; userId: string | null },
  deps: PublicSearchDeps,
): Promise<PublicSearchResponse> {
  if (!deps.isOpen()) return { ok: false, error: 'NOT_CONFIGURED' }

  const identity = identityFor(input.userId, input.ip)

  const blocked = await checkBlocked(identity, deps.limiter)
  if (!blocked.ok) return refusal(blocked)

  const parsed = parsePublicSearchQuery(input.query)
  if (!parsed.ok) {
    await recordStrike(identity, deps.limiter)
    return { ok: false, error: parsed.error }
  }

  const limits = await checkSearchLimits(identity, deps.limiter)
  if (!limits.ok) {
    if (limits.reason === 'RATE_LIMITED') await recordStrike(identity, deps.limiter)
    return refusal(limits)
  }

  let rows: DomainAvailabilityResult[]
  try {
    const cacheKey = `${parsed.label}|${parsed.tld ?? '*'}`
    rows = await deps.cache.getOrLoad(cacheKey, () => deps.fetchAvailability(parsed.label, parsed.tld))
  } catch (error) {
    if (error instanceof RegistrarError && error.code === 'NOT_CONFIGURED') {
      return { ok: false, error: 'NOT_CONFIGURED' }
    }
    console.error('[domain-search] registrar lookup failed:', error instanceof RegistrarError ? error.code : 'unexpected')
    return { ok: false, error: 'PROVIDER_ERROR' }
  }

  const allowed = new Set<string>(PUBLIC_SEARCH_TLDS)
  const wanted = rows.filter((row) => allowed.has(row.tld) && row.domain === `${parsed.label}.${row.tld}`)
  if (wanted.length === 0) return { ok: false, error: 'PROVIDER_ERROR' }

  try {
    const priced = await deps.priceRows(wanted)
    const results = priced.map(
      ({ domain, tld, status, quote }): PricedDomainResult => ({
        domain,
        tld,
        status,
        quote: quote
          ? {
              currency: 'TRY',
              netMinor: quote.netMinor,
              vatMinor: quote.vatMinor,
              grossMinor: quote.grossMinor,
              vatBps: quote.vatBps,
            }
          : null,
      }),
    )
    const pricingAvailable = results.every((r) => r.status !== 'available' || r.quote !== null)
    return { ok: true, results, pricingAvailable }
  } catch (error) {
    console.error('[domain-search] pricing failed:', error instanceof Error ? error.name : 'unexpected')
    return { ok: false, error: 'PROVIDER_ERROR' }
  }
}

function refusal(
  verdict: { ok: false; reason: 'RATE_LIMITED'; retryAfterSeconds: number } | { ok: false; reason: 'UNAVAILABLE' },
): PublicSearchResponse {
  return verdict.reason === 'RATE_LIMITED'
    ? { ok: false, error: 'RATE_LIMITED', retryAfterSeconds: verdict.retryAfterSeconds }
    : { ok: false, error: 'TEMPORARILY_UNAVAILABLE' }
}
