export type ScanFetchErrorCode =
  | 'TIMEOUT'
  | 'TOO_LARGE'
  | 'BLOCKED'
  | 'NETWORK'
  | 'NOT_ALLOWED'
  | 'REDIRECT_LIMIT'
  | 'BAD_STATUS'
  | 'BAD_CONTENT_TYPE'
  | 'BAD_ENCODING'
  | 'ROBOTS_DISALLOWED'
  | 'NOINDEX'

/**
 * Internal failure reason. It is for server logs and tests only: callers must
 * show every one of these to the visitor as the same generic "unreachable"
 * message, otherwise the scanner becomes an oracle that maps the internal network
 * ("blocked" vs "timed out" vs "no such host").
 */
export class ScanFetchError extends Error {
  constructor(readonly code: ScanFetchErrorCode) {
    super(code)
    this.name = 'ScanFetchError'
  }
}
