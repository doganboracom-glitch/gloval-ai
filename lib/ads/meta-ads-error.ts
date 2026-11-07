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
  // Phase M2 (paused publishing)
  | 'publish_not_allowed'
  | 'publish_permission_missing'
  | 'publish_quota_exceeded'
  | 'publish_in_progress'
  | 'plan_not_found'
  | 'plan_invalid'
  | 'plan_not_approved'
  | 'plan_changed'
  | 'special_category_unsupported'
  | 'policy_blocked'
  | 'page_required'
  | 'image_invalid'
  | 'payment_method_missing'
  | 'account_restricted'
  | 'budget_too_low'
  | 'meta_rejected'
  | 'app_not_live'
  | 'write_outcome_unknown'

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
    case 'publish_not_allowed':
    case 'publish_permission_missing':
      return 403
    case 'rate_limited':
    case 'api_quota_exceeded':
    case 'connection_limit_exceeded':
    case 'publish_quota_exceeded':
      return 429
    case 'connection_not_found':
    case 'account_not_found':
    case 'state_invalid':
    case 'flow_expired':
    case 'plan_not_found':
      return 404
    case 'publish_in_progress':
    case 'plan_changed':
    case 'plan_not_approved':
      return 409
    case 'meta_rejected':
    case 'app_not_live':
    case 'payment_method_missing':
    case 'account_restricted':
    case 'budget_too_low':
    case 'policy_blocked':
    case 'special_category_unsupported':
    case 'page_required':
    case 'image_invalid':
    case 'plan_invalid':
      return 422
    case 'write_outcome_unknown':
      return 503
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
