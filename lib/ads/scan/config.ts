/** Hard limits of the ads site scanner. Every number here is enforced in code and covered by tests. */
export const SCAN_LIMITS = {
  /** Redirect hops followed per request (the original request is hop 0). */
  maxRedirects: 3,
  /** Connect + headers + body budget of ONE HTTP request (also stops slow-loris bodies). */
  requestTimeoutMs: 12_000,
  /** Wall-clock budget of one whole scan (robots + every page). */
  totalTimeoutMs: 20_000,
  /**
   * Bytes streamed from a page; the rest is dropped and the page is used
   * truncated. The title, meta tags, headings and first content sit at the
   * start, so a 250-500 KB news page never needs to be downloaded in full.
   */
  pageMaxBytes: 524_288,
  /** Bytes read from robots.txt (RFC 9309 asks parsers to honour at least 500 KiB). */
  robotsMaxBytes: 524_288,
  /** Bytes of a non-2xx answer read to recognise a WAF challenge page. */
  errorBodyMaxBytes: 16_384,
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

/** Identifies the bot and links to a public page with contact details and how to allow or block it. */
export const SCAN_BOT_INFO_URL = 'https://gloval.ai/bot'

export const SCAN_USER_AGENT = `GlovalAdsBot/1.0 (+${SCAN_BOT_INFO_URL})`

/** The product token a robots.txt group must name to address this scanner. */
export const ROBOTS_PRODUCT_TOKEN = 'glovaladsbot'

/** Only these content types are read as pages. */
export const HTML_CONTENT_TYPE = /^(?:text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/i
