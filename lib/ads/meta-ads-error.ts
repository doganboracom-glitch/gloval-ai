import type { MetaErrorDetail } from '@/lib/ads/meta-error-detail'

export type MetaAdsErrorCode =
  | 'configuration_missing'
  | 'invalid_request'
  | 'not_authenticated'
  | 'csrf_failed'
  | 'rate_limited'
  | 'state_invalid'
  | 'flow_expired'
  | 'oauth_denied'
  | 'oauth_failed'
  | 'permission_missing'
  | 'config_permission_missing'
  | 'reauth_required'
  | 'token_expired'
  | 'no_accounts'
  | 'account_not_found'
  | 'connection_not_found'
  | 'connection_limit_exceeded'
  | 'api_quota_exceeded'
  | 'quota_check_failed'
  | 'provider_unavailable'
  | 'provider_error'
  | 'kill_switch_active'
  | 'disconnect_failed'
  | 'signature_invalid'

export class MetaAdsError extends Error {
  readonly code: MetaAdsErrorCode
  /** Safe, allow-listed summary of the Graph error (never the raw body). */
  readonly detail: MetaErrorDetail | null
  /** Permissions the user did not grant; only filled for `permission_missing`. */
  readonly missingScopes: readonly string[]

  constructor(code: MetaAdsErrorCode, detail: MetaErrorDetail | null = null, missingScopes: readonly string[] = []) {
    super(code)
    this.name = 'MetaAdsError'
    this.code = code
    this.detail = detail
    this.missingScopes = missingScopes
  }
}

export function isMetaAdsError(error: unknown): error is MetaAdsError {
  return error instanceof MetaAdsError
}

export function metaAdsErrorCode(error: unknown): MetaAdsErrorCode {
  return isMetaAdsError(error) ? error.code : 'provider_error'
}

/** Never returns 502/504: Cloudflare replaces those with an HTML page that hides the JSON error code. */
export function metaAdsHttpStatus(code: MetaAdsErrorCode): number {
  switch (code) {
    case 'not_authenticated':
      return 401
    case 'csrf_failed':
    case 'signature_invalid':
      return 403
    case 'rate_limited':
    case 'api_quota_exceeded':
    case 'connection_limit_exceeded':
      return 429
    case 'connection_not_found':
    case 'account_not_found':
    case 'state_invalid':
    case 'flow_expired':
      return 404
    case 'invalid_request':
    case 'oauth_denied':
    case 'permission_missing':
    case 'config_permission_missing':
    case 'no_accounts':
      return 400
    case 'configuration_missing':
    case 'kill_switch_active':
    case 'quota_check_failed':
    case 'oauth_failed':
    case 'reauth_required':
    case 'token_expired':
    case 'provider_unavailable':
    case 'provider_error':
    case 'disconnect_failed':
      return 503
  }
}
