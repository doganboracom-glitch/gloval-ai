'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
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

  let userId: string | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    userId = data.user?.id ?? null
  } catch {
    // Treated as anonymous.
  }

  return runPublicDomainSearch({ query, ip, userId }, defaultPublicSearchDeps)
}
