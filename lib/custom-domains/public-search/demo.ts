import { isDomainSearchDemo } from '@/lib/domains/feature-flags'
import type { DomainQuoteView, PricedDomainResult } from '../pricing/calc'
import { PUBLIC_SEARCH_TLDS, parsePublicSearchQuery } from './validate'
import type { PublicSearchResponse } from './service'

/**
 * Preview-only stand-in for the registrar. It exists so the page can be
 * reviewed visually where no registrar is configured. It never calls the
 * registrar, the payment provider or the database, and `isDomainSearchDemo`
 * is false in production whatever DOMAIN_SEARCH_DEMO says.
 */

const VAT_BPS = 2000

/** Fake yearly net prices in kurus. Not real prices. */
const DEMO_NET_MINOR: Record<(typeof PUBLIC_SEARCH_TLDS)[number], number> = {
  com: 39900,
  net: 44900,
  org: 42900,
  co: 79900,
  'com.tr': 19900,
  info: 29900,
}

function demoQuote(net: number): DomainQuoteView {
  const vat = Math.round((net * VAT_BPS) / 10000)
  return { currency: 'TRY', netMinor: net, vatMinor: vat, grossMinor: net + vat, vatBps: VAT_BPS }
}

export function buildDemoSearchResponse(query: unknown): PublicSearchResponse {
  const parsed = parsePublicSearchQuery(query)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const tlds = parsed.tld ? [parsed.tld] : PUBLIC_SEARCH_TLDS
  const results: PricedDomainResult[] = tlds.map((tld) => {
    // Demo rule: a bare brand shows ".com" as taken so the alternatives box is visible.
    const taken = !parsed.tld && tld === 'com'
    return {
      domain: `${parsed.label}.${tld}`,
      tld,
      status: taken ? 'unavailable' : 'available',
      quote: taken ? null : demoQuote(DEMO_NET_MINOR[tld]),
    }
  })
  return { ok: true, results, pricingAvailable: true }
}

/** Fake response when demo mode is on, otherwise null so the real service runs. */
export function demoSearchOrNull(
  query: unknown,
  env: Record<string, string | undefined> = process.env,
): PublicSearchResponse | null {
  return isDomainSearchDemo(env) ? buildDemoSearchResponse(query) : null
}
