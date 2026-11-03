import type { RegistrarTldRegistrationPrice } from '../registrar/types'
import type { PricedDomainResult } from './calc'
import { priceAvailabilityRows, type PricingContext } from './order'

const POPULAR_TLD_ORDER = [
  'ai',
  'io',
  'app',
  'dev',
  'shop',
  'store',
  'online',
  'site',
  'tech',
  'me',
  'xyz',
  'co.uk',
  'net.tr',
  'org.tr',
  'web.tr',
] as const

const POPULAR_TLD_RANK = new Map<string, number>(POPULAR_TLD_ORDER.map((tld, index) => [tld, index]))

type TldQuote = NonNullable<PricedDomainResult['quote']>

export type PricedTldRegistration = {
  tld: string
  quote: TldQuote
  popular: boolean
}

/** Uses the same server-side conversion, margin, and VAT calculation as search and checkout. */
export function priceTldRegistrations(
  rows: RegistrarTldRegistrationPrice[],
  context: PricingContext,
  now: Date = new Date(),
): PricedTldRegistration[] {
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.tld, row])).values())
  const priced = priceAvailabilityRows(
    uniqueRows.map((row) => ({
      domain: `catalog.${row.tld}`,
      tld: row.tld,
      status: 'available' as const,
      price: { registerCents: row.registerCents, currency: row.currency },
    })),
    context,
    now,
  )

  return priced
    .flatMap(({ tld, quote }) => (quote ? [{ tld, quote, popular: POPULAR_TLD_RANK.has(tld) }] : []))
    .sort((a, b) => {
      const aRank = POPULAR_TLD_RANK.get(a.tld) ?? Number.MAX_SAFE_INTEGER
      const bRank = POPULAR_TLD_RANK.get(b.tld) ?? Number.MAX_SAFE_INTEGER
      return aRank - bRank || a.tld.localeCompare(b.tld)
    })
}
