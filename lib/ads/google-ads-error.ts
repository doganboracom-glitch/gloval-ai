export type GoogleAdsErrorCode =
  | 'configuration_missing'
  | 'invalid_request'
  | 'not_authenticated'
  | 'csrf_failed'
  | 'rate_limited'
  | 'state_invalid'
  | 'flow_expired'
  | 'oauth_denied'
  | 'oauth_failed'
  | 'refresh_token_missing'
  | 'scope_missing'
  | 'no_accounts'
  | 'account_not_found'
  | 'manager_account'
  | 'connection_not_found'
  | 'connection_busy'
  | 'api_quota_exceeded'
  | 'quota_check_failed'
  | 'reauth_required'
  | 'not_authorized'
  | 'account_list_failed'
  | 'provider_unavailable'
  | 'provider_error'
  | 'disconnect_failed'

export class GoogleAdsError extends Error {
  readonly code: GoogleAdsErrorCode

  constructor(code: GoogleAdsErrorCode) {
    super(code)
    this.name = 'GoogleAdsError'
    this.code = code
  }
}

export function isGoogleAdsError(error: unknown): error is GoogleAdsError {
  return error instanceof GoogleAdsError
}

export function googleAdsErrorCode(error: unknown): GoogleAdsErrorCode {
  return isGoogleAdsError(error) ? error.code : 'provider_error'
}

export function googleAdsHttpStatus(code: GoogleAdsErrorCode): number {
  switch (code) {
    case 'not_authenticated':
      return 401
    case 'csrf_failed':
      return 403
    case 'rate_limited':
      return 429
    case 'connection_not_found':
    case 'account_not_found':
    case 'state_invalid':
    case 'flow_expired':
      return 404
    case 'connection_busy':
      return 409
    case 'configuration_missing':
      return 503
    case 'api_quota_exceeded':
      return 429
    case 'invalid_request':
    case 'oauth_denied':
    case 'refresh_token_missing':
    case 'scope_missing':
    case 'manager_account':
      return 400
    case 'quota_check_failed':
    case 'oauth_failed':
    case 'account_list_failed':
    case 'reauth_required':
    case 'not_authorized':
    case 'provider_unavailable':
    case 'provider_error':
    case 'disconnect_failed':
    case 'no_accounts':
      return 502
  }
}
