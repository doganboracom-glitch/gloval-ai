'use server'

import { headers } from 'next/headers'
import { isWhoisLookupEnabled } from '@/lib/domains/feature-flags'
import { resolveRateLimitIp } from './limits'
import { runWhoisLookup, type WhoisResponse } from './service'

/** Public (no login) WHOIS/RDAP lookup. Rules and limits live in `service.ts`. */
export async function lookupWhois(query: string): Promise<WhoisResponse> {
  if (!isWhoisLookupEnabled()) return { ok: false, error: 'UNAVAILABLE' }

  let ip: string | null = null
  try {
    const h = await headers()
    ip = resolveRateLimitIp((name) => h.get(name))
  } catch {
    // No request context: falls into the shared "unknown" bucket.
  }
  return runWhoisLookup({ query, ip })
}
