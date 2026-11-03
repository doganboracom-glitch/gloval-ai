import 'server-only'
import { unstable_cache } from 'next/cache'
import { loadPricingContext } from '../pricing/context'
import { priceTldRegistrations } from '../pricing/catalog'
import { getDomainRegistrarProvider, isLiveDomainRegistrar } from '../registrar/provider'
import { isDomainTldCatalogCapable } from '../registrar/types'
import { PUBLIC_SEARCH_TLDS } from './validate'
import type { PublicTldCatalogItem } from './service'

const TLD_PRICE_CACHE_SECONDS = 6 * 60 * 60
const CORE_TLDS = new Set<string>(PUBLIC_SEARCH_TLDS)

const readRegistrarTldPrices = unstable_cache(
  async () => {
    const registrar = getDomainRegistrarProvider()
    if (!registrar || !isLiveDomainRegistrar() || !isDomainTldCatalogCapable(registrar)) {
      throw new Error('domain_tld_catalog_unavailable')
    }
    return registrar.listRegistrationTlds()
  },
  ['domainnameapi-registration-tld-prices-v1'],
  { revalidate: TLD_PRICE_CACHE_SECONDS },
)

/** Prices and caches the registrar's read-only TLD list; order creation still revalidates live pricing. */
export async function getPricedPublicTldCatalog(): Promise<PublicTldCatalogItem[]> {
  const [registrarRows, pricingContext] = await Promise.all([readRegistrarTldPrices(), loadPricingContext()])
  const items = priceTldRegistrations(registrarRows, pricingContext)
    .filter((item) => !CORE_TLDS.has(item.tld))
    .map(({ tld, quote, popular }) => ({ tld, quote, popular }))

  if (items.length === 0) throw new Error('domain_tld_catalog_empty')
  return items
}
