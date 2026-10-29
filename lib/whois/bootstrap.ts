import { isIP } from 'node:net'
import { FetchError, nodeHttpsGet, safeFetch, type HttpGet } from './http'

/**
 * IANA RDAP bootstrap (https://data.iana.org/rdap/dns.json). It is the ONLY
 * source of RDAP server addresses: every server host that the lookup may ever
 * contact comes from this file, and nothing the user types is used as a host.
 */

export const IANA_BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json'
export const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000
/** If a refresh fails, the last good copy is still used for this long. */
export const BOOTSTRAP_STALE_MS = 7 * 24 * 60 * 60 * 1000
const BOOTSTRAP_MAX_BYTES = 2 * 1024 * 1024
const MAX_SERVICES = 5000

export type RdapBootstrap = {
  /** suffix (tld) -> https base URLs, each ending with "/". */
  servers: ReadonlyMap<string, readonly string[]>
  /** Every host the bootstrap file names; the SSRF allowlist. */
  hosts: ReadonlySet<string>
}

function normalizeServer(raw: unknown): URL | null {
  if (typeof raw !== 'string') return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password) return null
  if (url.port !== '' && url.port !== '443') return null
  if (isIP(host) !== 0 || isIP(host.replace(/^\[|\]$/g, '')) !== 0 || !host.includes('.')) return null
  url.search = ''
  url.hash = ''
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url
}

export function parseBootstrap(json: unknown): RdapBootstrap {
  const services = (json as { services?: unknown } | null)?.services
  if (!Array.isArray(services) || services.length === 0 || services.length > MAX_SERVICES) {
    throw new FetchError('BAD_BODY')
  }
  const servers = new Map<string, string[]>()
  const hosts = new Set<string>()
  for (const service of services) {
    if (!Array.isArray(service) || !Array.isArray(service[0]) || !Array.isArray(service[1])) continue
    const urls = (service[1] as unknown[]).map(normalizeServer).filter((u): u is URL => u !== null)
    if (urls.length === 0) continue
    const bases = urls.map((u) => u.toString())
    for (const url of urls) hosts.add(url.hostname.toLowerCase())
    for (const tld of service[0] as unknown[]) {
      if (typeof tld === 'string' && /^[a-z0-9.-]{1,63}$/.test(tld.toLowerCase())) {
        servers.set(tld.toLowerCase(), bases)
      }
    }
  }
  if (servers.size === 0) throw new FetchError('BAD_BODY')
  return { servers, hosts }
}

/** RDAP base URLs for a domain: the longest matching suffix in the bootstrap wins. */
export function findRdapServers(bootstrap: RdapBootstrap, domain: string): string[] {
  const labels = domain.toLowerCase().split('.')
  for (let i = 1; i < labels.length; i++) {
    const found = bootstrap.servers.get(labels.slice(i).join('.'))
    if (found) return [...found]
  }
  return []
}

export type BootstrapProviderOptions = {
  httpGet?: HttpGet
  now?: () => number
  ttlMs?: number
  staleMs?: number
}

export function createBootstrapProvider({
  httpGet = nodeHttpsGet,
  now = Date.now,
  ttlMs = BOOTSTRAP_TTL_MS,
  staleMs = BOOTSTRAP_STALE_MS,
}: BootstrapProviderOptions = {}) {
  let current: { value: RdapBootstrap; fetchedAt: number } | null = null
  let inFlight: Promise<RdapBootstrap> | null = null

  async function download(deadline: number): Promise<RdapBootstrap> {
    const res = await safeFetch(new URL(IANA_BOOTSTRAP_URL), {
      allowedHosts: new Set(['data.iana.org']),
      httpGet,
      deadline,
      maxBytes: BOOTSTRAP_MAX_BYTES,
      maxRedirects: 0,
      now,
    })
    if (res.status !== 200) throw new FetchError('BAD_STATUS')
    let json: unknown
    try {
      json = JSON.parse(res.body)
    } catch {
      throw new FetchError('BAD_BODY')
    }
    return parseBootstrap(json)
  }

  return {
    async get(deadline: number = now() + 6000): Promise<RdapBootstrap> {
      const t = now()
      if (current && t - current.fetchedAt < ttlMs) return current.value
      if (!inFlight) {
        inFlight = download(deadline)
          .then((value) => {
            current = { value, fetchedAt: now() }
            return value
          })
          .finally(() => {
            inFlight = null
          })
      }
      try {
        return await inFlight
      } catch (error) {
        if (current && now() - current.fetchedAt < staleMs) return current.value
        throw error
      }
    },
  }
}

export const defaultBootstrapProvider = createBootstrapProvider()
