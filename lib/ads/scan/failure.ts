import type { ScanFetchErrorCode } from './errors'

/** What a visitor may be told about a failed scan. */
export type ScanPublicCode = 'unreachable' | 'site_blocked' | 'site_unresponsive' | 'page_too_large'

/**
 * Reasons that come from the SITE's own answer (it refuses us, or it is slow or
 * broken) may be told apart. Reasons that could expose the internal network
 * (blocked address, DNS, scheme, port, TLS, redirects, content type) all stay in
 * the generic `unreachable` bucket. Internal addresses are never connected to, so
 * every one of them yields the same generic outcome.
 */
const PUBLIC_CODE: Record<ScanFetchErrorCode, ScanPublicCode> = {
  HTTP_FORBIDDEN: 'site_blocked',
  HTTP_RATE_LIMITED: 'site_blocked',
  WAF_CHALLENGE: 'site_blocked',
  ROBOTS_DISALLOWED: 'site_blocked',
  NOINDEX: 'site_blocked',
  TIMEOUT: 'site_unresponsive',
  HTTP_SERVER_ERROR: 'site_unresponsive',
  ROBOTS_UNAVAILABLE: 'site_unresponsive',
  NETWORK: 'site_unresponsive',
  TOO_LARGE: 'page_too_large',
  BLOCKED: 'unreachable',
  NOT_ALLOWED: 'unreachable',
  REDIRECT_LIMIT: 'unreachable',
  REDIRECT_LOOP: 'unreachable',
  BAD_STATUS: 'unreachable',
  BAD_CONTENT_TYPE: 'unreachable',
  BAD_ENCODING: 'unreachable',
  HTTP_NOT_FOUND: 'unreachable',
  HTTP_OTHER: 'unreachable',
  DNS_FAILURE: 'unreachable',
  TLS_ERROR: 'unreachable',
  PARSE_ERROR: 'unreachable',
}

export function publicCodeForFetchError(code: ScanFetchErrorCode): ScanPublicCode {
  return PUBLIC_CODE[code]
}

/** Maps a non-2xx, non-redirect status to its reason (WAF detection happens before this). */
export function reasonForStatus(status: number): ScanFetchErrorCode {
  if (status === 401 || status === 403) return 'HTTP_FORBIDDEN'
  if (status === 429) return 'HTTP_RATE_LIMITED'
  if (status === 404 || status === 410) return 'HTTP_NOT_FOUND'
  if (status >= 500) return 'HTTP_SERVER_ERROR'
  return 'HTTP_OTHER'
}
