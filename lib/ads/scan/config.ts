/** Hard limits of the ads site scanner. Every number here is enforced in code and covered by tests. */
export const SCAN_LIMITS = {
  /** Redirect hops followed per request (the original request is hop 0). */
  maxRedirects: 3,
  /** Connect + headers + body budget of ONE HTTP request (also stops slow-loris bodies). */
  requestTimeoutMs: 4000,
  /** Wall-clock budget of one whole scan (robots + every page). */
  totalTimeoutMs: 10_000,
  /** Bytes read per page; the rest is dropped (page is used truncated). */
  pageMaxBytes: 1_048_576,
  /** Bytes read from robots.txt (RFC 9309 asks parsers to honour at least 500 KiB). */
  robotsMaxBytes: 524_288,
  /** Pages read per scan: the home page plus at most this many extra pages. */
  maxExtraPages: 2,
  /** Longest Location header accepted from a redirect. */
  maxLocationLength: 2048,
  /** Characters of visible text kept across all pages of one snapshot. */
  snapshotTextChars: 6000,
  /** Characters of visible text taken from the home page and from each extra page. */
  homeTextChars: 3000,
  extraPageTextChars: 1500,
} as const

export const SCAN_USER_AGENT = 'GlovalAdsBot/1.0 (+https://gloval.ai)'

/** The product token a robots.txt group must name to address this scanner. */
export const ROBOTS_PRODUCT_TOKEN = 'glovaladsbot'

/** Only these content types are read as pages. */
export const HTML_CONTENT_TYPE = /^(?:text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/i
