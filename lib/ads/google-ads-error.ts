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
  | 'invalid_publish_plan'
  | 'eu_political_declaration_required'
  | 'invalid_budget'
  | 'currency_mismatch'
  | 'plan_changed'
  | 'confirmation_required'
  | 'ad_disapproved'
  | 'ad_review_in_progress'
  | 'ad_review_status_unavailable'
  | 'publish_disabled'
  | 'disconnect_failed'
  | 'status_update_failed'

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
    case 'plan_changed':
    case 'confirmation_required':
    case 'ad_disapproved':
    case 'ad_review_in_progress':
      return 409
    case 'configuration_missing':
    case 'publish_disabled':
      return 503
    case 'api_quota_exceeded':
      return 429
    case 'invalid_request':
    case 'invalid_publish_plan':
    case 'eu_political_declaration_required':
    case 'invalid_budget':
    case 'currency_mismatch':
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
    case 'status_update_failed':
    case 'ad_review_status_unavailable':
    case 'no_accounts':
      return 502
  }
}
