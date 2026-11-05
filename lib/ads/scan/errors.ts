export type ScanFetchErrorCode =
  | 'TIMEOUT'
  | 'TOO_LARGE'
  | 'BLOCKED'
  | 'NETWORK'
  | 'NOT_ALLOWED'
  | 'REDIRECT_LIMIT'
  | 'REDIRECT_LOOP'
  | 'BAD_STATUS'
  | 'BAD_CONTENT_TYPE'
  | 'BAD_ENCODING'
  | 'ROBOTS_DISALLOWED'
  | 'ROBOTS_UNAVAILABLE'
  | 'NOINDEX'
  | 'HTTP_FORBIDDEN'
  | 'HTTP_RATE_LIMITED'
  | 'HTTP_NOT_FOUND'
  | 'HTTP_SERVER_ERROR'
  | 'HTTP_OTHER'
  | 'WAF_CHALLENGE'
  | 'DNS_FAILURE'
  | 'TLS_ERROR'
  | 'PARSE_ERROR'

/**
 * Internal failure reason. It is for server logs, the usage table and tests.
 * Visitors only ever see the coarse category from `failure.ts`: reasons that
 * could describe the internal network (blocked address, no such host, bad
 * scheme, TLS, redirect trouble) all collapse into the same generic message, so
 * the scanner cannot be used as an oracle that maps a private network.
 */
export class ScanFetchError extends Error {
  constructor(readonly code: ScanFetchErrorCode) {
    super(code)
    this.name = 'ScanFetchError'
  }
}
