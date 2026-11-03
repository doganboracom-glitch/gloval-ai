'use server'

import { headers } from 'next/headers'
import { getRequestUser } from '@/lib/supabase/request-user'
import { defaultPublicSearchDeps } from './defaults'
import { demoSearchOrNull } from './demo'
import {
  checkBlocked,
  checkSearchLimits,
  identityFor,
  recordStrike,
  resolveRateLimitIp,
  type LimitVerdict,
} from './limits'
import { getPricedPublicTldCatalog } from './tld-catalog'
import { runPublicDomainSearch, type PublicSearchResponse, type PublicTldCatalogResponse } from './service'

async function getRequestIdentity(): Promise<{ ip: string | null; userId: string | null } | null> {
  let ip: string | null = null
  try {
    const h = await headers()
    ip = resolveRateLimitIp((name) => h.get(name))
  } catch {
    // No request context: the caller falls into the shared "unknown" bucket.
  }

  const authState = await getRequestUser()
  if (authState.kind === 'unavailable') return null
  return {
    ip,
    userId: authState.kind === 'authenticated' ? authState.user.id : null,
  }
}

function catalogLimitError(verdict: LimitVerdict): PublicTldCatalogResponse {
  if (!verdict.ok && verdict.reason === 'RATE_LIMITED') {
    return { ok: false, error: 'RATE_LIMITED', retryAfterSeconds: verdict.retryAfterSeconds }
  }
  return { ok: false, error: 'TEMPORARILY_UNAVAILABLE' }
}

/** Public (no login required) domain availability + price lookup. See `service.ts` for the rules. */
export async function searchDomainsPublic(query: string, requestedTld?: string): Promise<PublicSearchResponse> {
  if (requestedTld === undefined) {
    const demo = demoSearchOrNull(query)
    if (demo) return demo
  }

  const identity = await getRequestIdentity()
  if (!identity) return { ok: false, error: 'TEMPORARILY_UNAVAILABLE' }
  return runPublicDomainSearch({ query, ...identity, requestedTld }, defaultPublicSearchDeps)
}

/** Returns the cached, priced registrar catalog behind the same abuse limits as availability checks. */
export async function getPublicDomainTldCatalog(): Promise<PublicTldCatalogResponse> {
  if (!defaultPublicSearchDeps.isOpen()) return { ok: false, error: 'NOT_CONFIGURED' }

  const requestIdentity = await getRequestIdentity()
  if (!requestIdentity) return { ok: false, error: 'TEMPORARILY_UNAVAILABLE' }
  const identity = identityFor(requestIdentity.userId, requestIdentity.ip)

  const blocked = await checkBlocked(identity, defaultPublicSearchDeps.limiter)
  if (!blocked.ok) return catalogLimitError(blocked)

  const limits = await checkSearchLimits(identity, defaultPublicSearchDeps.limiter)
  if (!limits.ok) {
    if (limits.reason === 'RATE_LIMITED') await recordStrike(identity, defaultPublicSearchDeps.limiter)
    return catalogLimitError(limits)
  }

  try {
    return { ok: true, items: await getPricedPublicTldCatalog() }
  } catch (error) {
    console.error('[domain-search] TLD catalog failed:', error instanceof Error ? error.name : 'unexpected')
    return { ok: false, error: 'TEMPORARILY_UNAVAILABLE' }
  }
}
