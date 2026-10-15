import { isDomainLive, type CustomDomain } from './types'
import type { VercelClient } from './vercel'

/**
 * Fills `CustomDomain.redirectTo` from the hosting provider. Only needed when a
 * project has several live domains (typically `www.` + apex) and we must tell
 * the one that serves content from the one that 308s to it; with a single
 * candidate there is nothing to choose, so no provider call is made.
 */

const TTL_MS = 10 * 60 * 1000

type Entry = { redirectTo: string | null; expires: number }
const cache = new Map<string, Entry>()

export function clearRedirectCache(): void {
  cache.clear()
}

export async function hydrateRedirects(
  domains: readonly CustomDomain[],
  vercel: VercelClient,
  now: () => number = Date.now,
): Promise<CustomDomain[]> {
  const candidates = domains.filter((d) => d.websiteProjectId && isDomainLive(d))
  if (candidates.length < 2 || !vercel.configured || !vercel.getProjectDomain) return [...domains]

  const lookup = vercel.getProjectDomain.bind(vercel)
  const resolved = new Map<string, string | null>()
  await Promise.all(
    candidates.map(async (d) => {
      const hit = cache.get(d.domain)
      if (hit && hit.expires > now()) {
        resolved.set(d.id, hit.redirectTo)
        return
      }
      try {
        const result = await lookup(d.domain)
        // A failed lookup stays `undefined` (unknown) and is never cached.
        if (!result.ok) return
        const redirectTo = result.redirect ?? null
        cache.set(d.domain, { redirectTo, expires: now() + TTL_MS })
        resolved.set(d.id, redirectTo)
      } catch {
        // unknown
      }
    }),
  )

  return domains.map((d) => (resolved.has(d.id) ? { ...d, redirectTo: resolved.get(d.id) } : d))
}
