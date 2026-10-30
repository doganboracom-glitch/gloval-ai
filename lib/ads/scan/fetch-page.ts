import { normalizeSiteAddress } from '@/lib/ads/normalize-site-address'
import { HTML_CONTENT_TYPE, SCAN_LIMITS } from './config'
import { ScanFetchError } from './errors'
import { nodeScanGet, type ScanGet, type ScanResponse } from './http'
import { ALLOW_ALL, DISALLOW_ALL, headerForbidsUse, parseRobots, type RobotsRules } from './robots'

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/** Charset labels a Turkish / Western site realistically uses; anything else is read as UTF-8. */
const CHARSETS: Record<string, string> = {
  'utf-8': 'utf-8',
  utf8: 'utf-8',
  'iso-8859-9': 'windows-1254',
  'windows-1254': 'windows-1254',
  latin5: 'windows-1254',
  'iso-8859-1': 'windows-1252',
  'windows-1252': 'windows-1252',
  latin1: 'windows-1252',
  'iso-8859-15': 'iso-8859-15',
}

export function decodeHtml(bytes: Buffer, contentType: string | null): string {
  const fromHeader = contentType ? /charset\s*=\s*["']?([a-z0-9_-]+)/i.exec(contentType)?.[1] : undefined
  const sniffed = fromHeader
    ? undefined
    : /<meta[^>]+charset\s*=\s*["']?([a-z0-9_-]+)/i.exec(bytes.subarray(0, 2048).toString('latin1'))?.[1]
  const label = CHARSETS[(fromHeader ?? sniffed ?? 'utf-8').toLowerCase()] ?? 'utf-8'
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    return bytes.toString('utf8')
  }
}

/**
 * Re-run on EVERY request and EVERY redirect hop: web scheme only, the scheme's
 * default port only (http:80 / https:443), no credentials in the URL, and a host
 * that passes the same syntax gate as the visitor's input (no IP literals, no
 * localhost / internal suffixes). DNS is NOT checked here: that happens inside the
 * socket's `lookup` (see http.ts), at the moment of connecting.
 */
export function assertScannable(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ScanFetchError('NOT_ALLOWED')
  if (url.username || url.password) throw new ScanFetchError('NOT_ALLOWED')
  if (url.port !== '') throw new ScanFetchError('NOT_ALLOWED')
  if (!normalizeSiteAddress(url.hostname).ok) throw new ScanFetchError('NOT_ALLOWED')
}

export type FetchedPage = {
  finalUrl: URL
  html: string
  truncated: boolean
  /** True when the X-Robots-Tag header forbids using the page. */
  headerForbidsUse: boolean
}

export type ScanFetcherOptions = {
  httpGet?: ScanGet
  /** Absolute epoch-ms deadline shared by every request of one scan. */
  deadline: number
  now?: () => number
}

export type ScanFetcher = { fetchPage(url: URL): Promise<FetchedPage> }

export function createScanFetcher({ httpGet = nodeScanGet, deadline, now = Date.now }: ScanFetcherOptions): ScanFetcher {
  const robotsByOrigin = new Map<string, Promise<RobotsRules>>()

  async function get(
    start: URL,
    options: { contentType: RegExp | null; maxBytes: number; checkRobots: boolean },
  ): Promise<{ response: ScanResponse; finalUrl: URL }> {
    let url = start
    const seen = new Set<string>()
    for (let hop = 0; ; hop++) {
      assertScannable(url)
      if (seen.has(url.href)) throw new ScanFetchError('REDIRECT_LIMIT')
      seen.add(url.href)

      if (options.checkRobots) {
        const rules = await robotsFor(url.origin)
        if (!rules.isAllowed(`${url.pathname}${url.search}`)) throw new ScanFetchError('ROBOTS_DISALLOWED')
      }

      const remaining = deadline - now()
      if (remaining <= 0) throw new ScanFetchError('TIMEOUT')
      const response = await httpGet(url, {
        timeoutMs: Math.min(remaining, SCAN_LIMITS.requestTimeoutMs),
        maxBytes: options.maxBytes,
        contentType: options.contentType,
        onOverflow: 'truncate',
      })

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.location
        if (!location || hop >= SCAN_LIMITS.maxRedirects) throw new ScanFetchError('REDIRECT_LIMIT')
        if (location.length > SCAN_LIMITS.maxLocationLength) throw new ScanFetchError('NOT_ALLOWED')
        let next: URL
        try {
          next = new URL(location, url)
        } catch {
          throw new ScanFetchError('NOT_ALLOWED')
        }
        next.hash = ''
        url = next
        continue
      }
      return { response, finalUrl: url }
    }
  }

  function robotsFor(origin: string): Promise<RobotsRules> {
    let pending = robotsByOrigin.get(origin)
    if (!pending) {
      pending = loadRobots(origin)
      robotsByOrigin.set(origin, pending)
    }
    return pending
  }

  async function loadRobots(origin: string): Promise<RobotsRules> {
    try {
      const { response } = await get(new URL('/robots.txt', origin), {
        contentType: null,
        maxBytes: SCAN_LIMITS.robotsMaxBytes,
        checkRobots: false,
      })
      if (response.status >= 200 && response.status < 300) return parseRobots(response.bytes.toString('utf8'))
      if (response.status >= 400 && response.status < 500) return ALLOW_ALL
      return DISALLOW_ALL
    } catch {
      return DISALLOW_ALL
    }
  }

  return {
    async fetchPage(url) {
      const { response, finalUrl } = await get(url, {
        contentType: HTML_CONTENT_TYPE,
        maxBytes: SCAN_LIMITS.pageMaxBytes,
        checkRobots: true,
      })
      if (response.status < 200 || response.status >= 300) throw new ScanFetchError('BAD_STATUS')
      return {
        finalUrl,
        html: decodeHtml(response.bytes, response.contentType),
        truncated: response.truncated,
        headerForbidsUse: headerForbidsUse(response.xRobotsTag),
      }
    },
  }
}
