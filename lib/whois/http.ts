import https from 'node:https'
import { createGuardedLookup } from './ip-guard'

/**
 * Minimal, hardened HTTPS GET used for the IANA bootstrap file and RDAP
 * servers. Redirects are NOT followed here (the caller re-validates every hop),
 * the body is capped, and the socket only ever connects to public addresses.
 */

export const REQUEST_TIMEOUT_MS = 6000

export type HttpResponse = { status: number; location: string | null; contentType: string | null; body: string }
export type HttpGetOptions = { timeoutMs: number; maxBytes: number }
export type HttpGet = (url: URL, options: HttpGetOptions) => Promise<HttpResponse>

export type FetchErrorCode =
  | 'TIMEOUT'
  | 'TOO_LARGE'
  | 'BLOCKED'
  | 'NETWORK'
  | 'NOT_ALLOWED'
  | 'REDIRECT_LIMIT'
  | 'BAD_STATUS'
  | 'BAD_BODY'

export class FetchError extends Error {
  constructor(readonly code: FetchErrorCode) {
    super(code)
    this.name = 'FetchError'
  }
}

const guardedLookup = createGuardedLookup()

export const nodeHttpsGet: HttpGet = (url, { timeoutMs, maxBytes }) =>
  new Promise<HttpResponse>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    const req = https.request(
      {
        protocol: 'https:',
        hostname: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        agent: false,
        lookup: guardedLookup as never,
        headers: {
          accept: 'application/rdap+json, application/json;q=0.9',
          'user-agent': 'GLOVAL-AI-WHOIS/1.0',
          'accept-encoding': 'identity',
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > maxBytes) {
            finish(() => reject(new FetchError('TOO_LARGE')))
            req.destroy()
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () =>
          finish(() =>
            resolve({
              status: res.statusCode ?? 0,
              location: typeof res.headers.location === 'string' ? res.headers.location : null,
              contentType: typeof res.headers['content-type'] === 'string' ? res.headers['content-type'] : null,
              body: Buffer.concat(chunks).toString('utf8'),
            }),
          ),
        )
        res.on('error', () => finish(() => reject(new FetchError('NETWORK'))))
      },
    )

    const timer = setTimeout(() => {
      finish(() => reject(new FetchError('TIMEOUT')))
      req.destroy()
    }, timeoutMs)

    req.on('error', (error: Error & { code?: string }) =>
      finish(() => reject(new FetchError(error.name === 'BlockedAddressError' ? 'BLOCKED' : 'NETWORK'))),
    )
    req.end()
  })

export type SafeFetchOptions = {
  allowedHosts: ReadonlySet<string>
  httpGet: HttpGet
  /** Absolute epoch-ms deadline shared by every request of one lookup. */
  deadline: number
  maxBytes: number
  maxRedirects?: number
  now?: () => number
}

function assertAllowed(url: URL, allowedHosts: ReadonlySet<string>) {
  const ok =
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    (url.port === '' || url.port === '443') &&
    allowedHosts.has(url.hostname.toLowerCase())
  if (!ok) throw new FetchError('NOT_ALLOWED')
}

/** GET with allowlist enforcement on every hop and a bounded redirect chain. */
export async function safeFetch(start: URL, options: SafeFetchOptions): Promise<HttpResponse> {
  const { allowedHosts, httpGet, deadline, maxBytes, maxRedirects = 2, now = Date.now } = options
  let url = start
  for (let hop = 0; ; hop++) {
    assertAllowed(url, allowedHosts)
    const remaining = deadline - now()
    if (remaining <= 0) throw new FetchError('TIMEOUT')
    const res = await httpGet(url, { timeoutMs: Math.min(remaining, REQUEST_TIMEOUT_MS), maxBytes })
    if (res.status >= 300 && res.status < 400) {
      if (!res.location || hop >= maxRedirects) throw new FetchError('REDIRECT_LIMIT')
      try {
        url = new URL(res.location, url)
      } catch {
        throw new FetchError('NOT_ALLOWED')
      }
      continue
    }
    return res
  }
}
