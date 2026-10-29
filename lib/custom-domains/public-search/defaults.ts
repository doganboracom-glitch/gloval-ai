import 'server-only'
import { evaluateDomainPaymentStackFromEnv } from '@/lib/payments/domain-e2e-mode'
import { loadPricingContext } from '../pricing/context'
import { priceAvailabilityRows } from '../pricing/order'
import { getDomainRegistrarProvider, isLiveDomainRegistrar } from '../registrar/provider'
import { RegistrarError } from '../registrar/types'
import { TtlCache } from './cache'
import { rpcLimiter } from './limits'
import type { PublicSearchDeps } from './service'
import { PUBLIC_SEARCH_TLDS } from './validate'

const CACHE_TTL_MS = 60_000

/**
 * The same gates as buying: a live registrar and an allowed payment stack. If
 * either fails, the page says "coming soon" and the endpoint answers
 * NOT_CONFIGURED, so search can never be open while purchase is closed.
 */
export function isPublicDomainSearchOpen(): boolean {
  if (!isLiveDomainRegistrar()) return false
  return evaluateDomainPaymentStackFromEnv().allowed
}

const cache = new TtlCache<Awaited<ReturnType<PublicSearchDeps['fetchAvailability']>>>(CACHE_TTL_MS)

export const defaultPublicSearchDeps: PublicSearchDeps = {
  isOpen: isPublicDomainSearchOpen,
  async fetchAvailability(label, tld) {
    const registrar = getDomainRegistrarProvider()
    if (!registrar) throw new RegistrarError('NOT_CONFIGURED')
    const primary = tld ?? PUBLIC_SEARCH_TLDS[0]
    const alternatives = tld ? [] : PUBLIC_SEARCH_TLDS.slice(1)
    return registrar.checkAvailability(`${label}.${primary}`, [...alternatives])
  },
  async priceRows(rows) {
    return priceAvailabilityRows(rows, await loadPricingContext())
  },
  limiter: rpcLimiter,
  cache,
}
