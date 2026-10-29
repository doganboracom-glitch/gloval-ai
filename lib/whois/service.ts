import { TtlCache } from '@/lib/custom-domains/public-search/cache'
import { isSupportedPublicTld } from '@/lib/custom-domains/public-search/validate'
import type { LimiterDeps } from '@/lib/custom-domains/public-search/limits'
import { defaultBootstrapProvider, findRdapServers, type RdapBootstrap } from './bootstrap'
import { FetchError, nodeHttpsGet, safeFetch, type HttpGet } from './http'
import { checkWhoisLimits, rpcLimiter, whoisIdentityKey } from './limits'
import { sanitizeRdapDomain, type WhoisRecord } from './sanitize'
import { parseWhoisQuery } from './validate'

export const WHOIS_TOTAL_TIMEOUT_MS = 6000
const RDAP_MAX_BYTES = 512 * 1024
const MAX_SERVERS_TRIED = 2
const CACHE_TTL_MS = 10 * 60 * 1000

type Common = {
  domain: string
  /** What to hand to /alan-adi-sorgula?q= : the full name if GLOVAL sells that extension, else just the label. */
  buyQuery: string
  buyable: boolean
}

export type WhoisOutcome =
  | (Common & { status: 'registered'; record: WhoisRecord })
  | (Common & { status: 'available' })
  | (Common & { status: 'unavailable'; reason: 'NO_RDAP' | 'LOOKUP_FAILED' })

export type WhoisResponse =
  | { ok: true; outcome: WhoisOutcome }
  | { ok: false; error: 'INVALID_QUERY' }
  | { ok: false; error: 'RATE_LIMITED'; retryAfterSeconds: number }
  | { ok: false; error: 'UNAVAILABLE' }

type Definitive = { kind: 'registered'; record: WhoisRecord } | { kind: 'available' }

export type WhoisDeps = {
  limiter: LimiterDeps
  httpGet: HttpGet
  getBootstrap: (deadline: number) => Promise<RdapBootstrap>
  cache: TtlCache<Definitive>
  now: () => number
}

export function createWhoisDeps(overrides: Partial<WhoisDeps> = {}): WhoisDeps {
  return {
    limiter: rpcLimiter,
    httpGet: nodeHttpsGet,
    getBootstrap: (deadline) => defaultBootstrapProvider.get(deadline),
    cache: new TtlCache<Definitive>(CACHE_TTL_MS),
    now: Date.now,
    ...overrides,
  }
}

let sharedDeps: WhoisDeps | null = null
export function defaultWhoisDeps(): WhoisDeps {
  sharedDeps ??= createWhoisDeps()
  return sharedDeps
}

/** RDAP says "not found" (404) = unregistered; 200 = registered; anything else is a failure. */
async function queryRdap(
  domain: string,
  servers: string[],
  bootstrap: RdapBootstrap,
  deps: WhoisDeps,
  deadline: number,
): Promise<Definitive> {
  let lastError: unknown = new FetchError('NETWORK')
  for (const base of servers.slice(0, MAX_SERVERS_TRIED)) {
    try {
      const res = await safeFetch(new URL(`domain/${encodeURIComponent(domain)}`, base), {
        allowedHosts: bootstrap.hosts,
        httpGet: deps.httpGet,
        deadline,
        maxBytes: RDAP_MAX_BYTES,
        now: deps.now,
      })
      if (res.status === 404) return { kind: 'available' }
      if (res.status !== 200) throw new FetchError('BAD_STATUS')
      let json: unknown
      try {
        json = JSON.parse(res.body)
      } catch {
        throw new FetchError('BAD_BODY')
      }
      const sanitized = sanitizeRdapDomain(json, domain)
      if (!sanitized.ok) throw new FetchError('BAD_BODY')
      return { kind: 'registered', record: sanitized.record }
    } catch (error) {
      lastError = error
      if (error instanceof FetchError && error.code === 'TIMEOUT' && deps.now() >= deadline) break
    }
  }
  throw lastError
}

export async function runWhoisLookup(
  input: { query: unknown; ip: string | null },
  deps: WhoisDeps = defaultWhoisDeps(),
): Promise<WhoisResponse> {
  const parsed = parseWhoisQuery(input.query)
  if (!parsed.ok) return { ok: false, error: 'INVALID_QUERY' }

  const verdict = await checkWhoisLimits(whoisIdentityKey(input.ip), deps.limiter)
  if (!verdict.ok) {
    return verdict.reason === 'RATE_LIMITED'
      ? { ok: false, error: 'RATE_LIMITED', retryAfterSeconds: verdict.retryAfterSeconds }
      : { ok: false, error: 'UNAVAILABLE' }
  }

  const { domain, label, suffix } = parsed
  const buyable = isSupportedPublicTld(suffix)
  const common: Common = { domain, buyable, buyQuery: buyable ? domain : label }
  const deadline = deps.now() + WHOIS_TOTAL_TIMEOUT_MS

  try {
    const bootstrap = await deps.getBootstrap(deadline)
    const servers = findRdapServers(bootstrap, domain)
    if (servers.length === 0) return { ok: true, outcome: { ...common, status: 'unavailable', reason: 'NO_RDAP' } }

    const result = await deps.cache.getOrLoad(domain, () => queryRdap(domain, servers, bootstrap, deps, deadline))
    return {
      ok: true,
      outcome:
        result.kind === 'registered'
          ? { ...common, status: 'registered', record: result.record }
          : { ...common, status: 'available' },
    }
  } catch (error) {
    // Only the failure class is logged, never the queried name.
    console.error('[whois] lookup failed:', error instanceof FetchError ? error.code : 'UNKNOWN')
    return { ok: true, outcome: { ...common, status: 'unavailable', reason: 'LOOKUP_FAILED' } }
  }
}
