import http from 'node:http'
import https from 'node:https'
import { createGuardedLookup } from '@/lib/whois/ip-guard'
import { SCAN_LIMITS, SCAN_USER_AGENT } from './config'
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
 * - A 2xx body is streamed up to `maxBytes`; any other status reads only a small
 *   prefix (enough to recognise a WAF challenge page) and then drops the socket.
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
  /** When the timer fires after the 2xx body has started, return what arrived (flagged truncated) instead of failing. */
  partialOnTimeout?: boolean
}

export type ScanResponse = {
  status: number
  location: string | null
  contentType: string | null
  xRobotsTag: string | null
  /** Value of Cloudflare's `cf-mitigated` header (`challenge` on a verification page). */
  cfMitigated?: string | null
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

const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_NODATA', 'EAI_NONAME', 'ENODATA'])
const TLS_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'HOSTNAME_MISMATCH',
])

/** Turns a socket-level error into a reason; only the code and name are inspected, never the message. */
export function classifyNetworkError(error: Error): ScanFetchError {
  if (error.name === 'BlockedAddressError') return new ScanFetchError('BLOCKED')
  const code = (error as { code?: unknown }).code
  if (typeof code === 'string') {
    if (DNS_CODES.has(code)) return new ScanFetchError('DNS_FAILURE')
    if (code === 'ETIMEDOUT') return new ScanFetchError('TIMEOUT')
    if (TLS_CODES.has(code) || code.startsWith('ERR_TLS') || code.startsWith('ERR_SSL')) {
      return new ScanFetchError('TLS_ERROR')
    }
  }
  return new ScanFetchError('NETWORK')
}

export function createNodeScanGet(lookup: GuardedLookup = createGuardedLookup()): ScanGet {
  return (url, { timeoutMs, maxBytes, contentType, onOverflow, partialOnTimeout = false }) =>
    new Promise<ScanResponse>((resolve, reject) => {
      const secure = url.protocol === 'https:'
      if (!secure && url.protocol !== 'http:') {
        reject(new ScanFetchError('NOT_ALLOWED'))
        return
      }

      let settled = false
      /** Builds what has arrived so far, once headers are in. */
      let partial: (() => ScanResponse) | null = null
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
            cfMitigated: headerValue(res.headers['cf-mitigated']),
          }

          if (status < 200 || status >= 300) {
            const errorChunks: Buffer[] = []
            let errorSize = 0
            const errorResponse = (): ScanResponse => ({
              ...meta,
              bytes: Buffer.concat(errorChunks),
              truncated: errorSize >= SCAN_LIMITS.errorBodyMaxBytes,
            })
            partial = errorResponse
            res.on('data', (chunk: Buffer) => {
              if (settled) return
              const room = SCAN_LIMITS.errorBodyMaxBytes - errorSize
              if (room > 0) {
                const piece = chunk.length > room ? chunk.subarray(0, room) : chunk
                errorChunks.push(piece)
                errorSize += piece.length
              }
              if (errorSize >= SCAN_LIMITS.errorBodyMaxBytes) {
                finish(() => resolve(errorResponse()))
                res.destroy()
              }
            })
            res.on('end', () => finish(() => resolve(errorResponse())))
            res.on('error', () => finish(() => resolve(errorResponse())))
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
          partial = () => ({ ...meta, bytes: Buffer.concat(chunks), truncated: true })
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
        const snapshot = partial?.()
        // A page whose body had started is still useful: its head holds the title and meta tags.
        const usable = snapshot && (snapshot.status >= 300 || (partialOnTimeout && snapshot.bytes.length > 0))
        if (snapshot && usable) finish(() => resolve(snapshot))
        else finish(() => reject(new ScanFetchError('TIMEOUT')))
        req.destroy()
      }, timeoutMs)

      req.on('error', (error: Error) => finish(() => reject(classifyNetworkError(error))))
      req.end()
    })
}

export const nodeScanGet: ScanGet = createNodeScanGet()
