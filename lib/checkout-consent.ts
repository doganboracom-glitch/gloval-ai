/**
 * Mandatory legal consents for every GLOVAL platform payment (plans, upgrades,
 * renewals, AI credit packs, add-ons, site rights, domain purchase / renewal /
 * transfer). Store payments of tenants' own sites are intentionally out of scope.
 *
 * Only the three flags, the server timestamp and the consent text version are
 * ever persisted: no IP, no personal data and not the consent text itself.
 */

/** Bump when the wording of any of the three consents changes. */
export const CHECKOUT_CONSENT_VERSION = 'consent_v1'

/** Error key returned by every payment-starting action when consents are missing. */
export const CONSENT_REQUIRED_ERROR = 'consent_required' as const

export type CheckoutConsents = {
  preInfo: boolean
  distance: boolean
  withdrawal: boolean
}

/** All three consents must be exactly `true`; anything else is rejected. */
export function hasAllCheckoutConsents(value: unknown): value is CheckoutConsents {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return v.preInfo === true && v.distance === true && v.withdrawal === true
}

export type ConsentColumns = {
  consent_version: string
  consent_pre_info: true
  consent_distance: true
  consent_withdrawal: true
  consented_at: string
}

/**
 * Evidence columns merged into the existing transaction / order row. The
 * timestamp and version are always set on the server, never taken from the client.
 */
export function buildConsentColumns(now: Date = new Date()): ConsentColumns {
  return {
    consent_version: CHECKOUT_CONSENT_VERSION,
    consent_pre_info: true,
    consent_distance: true,
    consent_withdrawal: true,
    consented_at: now.toISOString(),
  }
}
