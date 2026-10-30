import http from 'node:http'
import https from 'node:https'
import { createGuardedLookup } from '@/lib/whois/ip-guard'
import { SCAN_USER_AGENT } from './config'
import { ScanFetchError } from './errors'

/**
 * The scanner's only network client: Node's built-in `node:http` / `node:https`
 * (no global fetch, no undici, no third-party client).
 *
 * - `lookup` is the SSRF guard. Node calls it for every connection attempt, and
 *   it only ever returns addresses that are ALL public, so the address that was
 *   validated is the address the socket connects to. A name that answers with a
 *   public IP once and a private IP the next time (DNS rebinding) is refused on
 *   the second connection.
 * - Redirects are never followed here; the caller re-validates every hop.
 * - Only 2xx bodies are read; for any other status the socket is dropped as soon
 *   as the headers are in.
 * - The body is capped, `Accept-Encoding: identity` is sent (no compression bombs)
 *   and a compressed answer is refused, TLS certificates are verified, and one
 *   timer covers connect + headers + body (a slow-loris body cannot outlive it).
 * - No cookies and no credentials are ever sent.
 */

export type ScanGetOptions = {
  timeoutMs: number
  maxBytes: number
  /** When set, a 2xx answer whose Content-Type does not match is refused before its body is read. */
  contentType: RegExp | null
  /** `truncate` keeps the first `maxBytes` and flags it; `reject` fails with TOO_LARGE. */
  onOverflow: 'truncate' | 'reject'
}

export type ScanResponse = {
  status: number
  location: string | null
  contentType: string | null
  xRobotsTag: string | null
  bytes: Buffer
  truncated: boolean
}

export type ScanGet = (url: URL, options: ScanGetOptions) => Promise<ScanResponse>

type GuardedLookup = ReturnType<typeof createGuardedLookup>

function headerValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  return null
}

export function createNodeScanGet(lookup: GuardedLookup = createGuardedLookup()): ScanGet {
  return (url, { timeoutMs, maxBytes, contentType, onOverflow }) =>
    new Promise<ScanResponse>((resolve, reject) => {
      const secure = url.protocol === 'https:'
      if (!secure && url.protocol !== 'http:') {
        reject(new ScanFetchError('NOT_ALLOWED'))
        return
      }

      let settled = false
      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn()
      }

      const request = secure ? https.request : http.request
      const req = request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (secure ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          agent: false,
          lookup: lookup as never,
          headers: {
            accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5,*/*;q=0.1',
            'accept-encoding': 'identity',
            'accept-language': 'tr,en;q=0.8',
            'user-agent': SCAN_USER_AGENT,
            connection: 'close',
          },
        },
        (res) => {
          const status = res.statusCode ?? 0
          const meta = {
            status,
            location: headerValue(res.headers.location),
            contentType: headerValue(res.headers['content-type']),
            xRobotsTag: headerValue(res.headers['x-robots-tag']),
          }

          if (status < 200 || status >= 300) {
            finish(() => resolve({ ...meta, bytes: Buffer.alloc(0), truncated: false }))
            res.destroy()
            return
          }

          const encoding = headerValue(res.headers['content-encoding'])
          if (encoding && encoding.trim().toLowerCase() !== 'identity') {
            finish(() => reject(new ScanFetchError('BAD_ENCODING')))
            res.destroy()
            return
          }
          if (contentType && !(meta.contentType && contentType.test(meta.contentType))) {
            finish(() => reject(new ScanFetchError('BAD_CONTENT_TYPE')))
            res.destroy()
            return
          }

          const chunks: Buffer[] = []
          let size = 0
          res.on('data', (chunk: Buffer) => {
            if (settled) return
            const room = maxBytes - size
            if (chunk.length > room) {
              if (onOverflow === 'reject') {
                finish(() => reject(new ScanFetchError('TOO_LARGE')))
              } else {
                if (room > 0) chunks.push(chunk.subarray(0, room))
                finish(() => resolve({ ...meta, bytes: Buffer.concat(chunks), truncated: true }))
              }
              res.destroy()
              return
            }
            size += chunk.length
            chunks.push(chunk)
          })
          res.on('end', () => finish(() => resolve({ ...meta, bytes: Buffer.concat(chunks), truncated: false })))
          res.on('error', () => finish(() => reject(new ScanFetchError('NETWORK'))))
        },
      )

      const timer = setTimeout(() => {
        finish(() => reject(new ScanFetchError('TIMEOUT')))
        req.destroy()
      }, timeoutMs)

      req.on('error', (error: Error) =>
        finish(() => reject(new ScanFetchError(error.name === 'BlockedAddressError' ? 'BLOCKED' : 'NETWORK'))),
      )
      req.end()
    })
}

export const nodeScanGet: ScanGet = createNodeScanGet()
