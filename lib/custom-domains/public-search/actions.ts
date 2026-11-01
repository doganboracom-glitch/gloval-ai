'use server'

import { headers } from 'next/headers'
import { getRequestUser } from '@/lib/supabase/request-user'
import { defaultPublicSearchDeps } from './defaults'
import { demoSearchOrNull } from './demo'
import { resolveRateLimitIp } from './limits'
import { runPublicDomainSearch, type PublicSearchResponse } from './service'

/** Public (no login required) domain availability + price lookup. See `service.ts` for the rules. */
export async function searchDomainsPublic(query: string): Promise<PublicSearchResponse> {
  const demo = demoSearchOrNull(query)
  if (demo) return demo

  let ip: string | null = null
  try {
    const h = await headers()
    ip = resolveRateLimitIp((name) => h.get(name))
  } catch {
    // No request context: the caller falls into the shared "unknown" bucket.
  }

  const authState = await getRequestUser()
  if (authState.kind === 'unavailable') {
    return { ok: false, error: 'TEMPORARILY_UNAVAILABLE' }
  }
  const userId = authState.kind === 'authenticated' ? authState.user.id : null

  return runPublicDomainSearch({ query, ip, userId }, defaultPublicSearchDeps)
}
