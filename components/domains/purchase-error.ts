import type { PurchaseErrorCode } from '@/lib/custom-domains/registrar/actions'
import { buildDomainBuyPath, DOMAINS_PATH } from '@/lib/custom-domains/public-search/buy-link'
import type { Dict } from '@/lib/i18n'
import { sanitizeNextPath } from '@/lib/safe-redirect'

export const SUPPORT_EMAIL = 'support@gloval.ai'
export const SUPPORT_PATH = '/support/new'

export type PurchaseErrorAction = 'billing' | 'support' | null
export type PurchaseErrorView = { message: string; action: PurchaseErrorAction }

/**
 * Turns a purchase failure code into buyer-facing copy plus the follow-up the UI
 * should offer. Unknown codes (and a thrown action) fall back to the generic
 * message with the support link, never to a raw error string.
 */
export function describePurchaseError(
  code: PurchaseErrorCode | 'UNKNOWN',
  d: Dict['domains'],
  consentRequired: string,
): PurchaseErrorView {
  switch (code) {
    case 'CONSENT_REQUIRED':
      return { message: consentRequired, action: null }
    case 'NOT_CONFIGURED':
      return { message: d.buyNotConfigured, action: 'support' }
    case 'INVALID_DOMAIN':
      return { message: d.buyErrInvalidDomain, action: null }
    case 'UNAVAILABLE':
      return { message: d.buyErrUnavailable, action: null }
    case 'ALREADY_OWNED':
      return { message: d.buyErrAlreadyOwned, action: null }
    case 'LIMIT_REACHED':
      return { message: d.buyErrLimitReached, action: null }
    case 'NOT_ENTITLED':
      return { message: d.buyErrNotEntitled, action: null }
    case 'PRICING_UNAVAILABLE':
      return { message: d.buyPricingUnavailable, action: null }
    case 'PAYMENT_UNAVAILABLE':
      return { message: d.buyErrPaymentUnavailable, action: 'support' }
    case 'BILLING_PROFILE_INCOMPLETE':
      return { message: d.buyErrBillingProfile, action: 'billing' }
    case 'RATE_LIMITED':
      return { message: d.buyErrRateLimited, action: null }
    case 'REGISTRAR_ERROR':
      return { message: d.buyErrRegistrar, action: 'support' }
    default:
      return { message: d.buyErrFailed, action: 'support' }
  }
}

/**
 * Billing page link that brings the buyer back to this exact purchase once the
 * invoice profile is saved. The return path is built from a validated domain and
 * passed through `sanitizeNextPath`, so it is always a same-site path.
 */
export function buildBillingProfileHref(domain: string): string {
  const returnTo = sanitizeNextPath(buildDomainBuyPath(domain) ?? DOMAINS_PATH, DOMAINS_PATH)
  return `/billing?fatura=1&next=${encodeURIComponent(returnTo)}#fatura-bilgileri`
}
