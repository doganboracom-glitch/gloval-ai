/**
 * GLOVAL Ads (BETA) credit prices. The single place to change them.
 *
 * Deliberately independent from `AI_ACTION_COSTS` in `lib/ai-credits.ts`: the
 * ads ledger rows are written only by the `ads_charge_credits` /
 * `ads_refund_credits` RPCs, never by `consume_ai_credits`.
 *
 * Credits are not money, so no "KDV dahil" wording applies to these numbers.
 * Any TRY price shown next to them must say "KDV dahil".
 */
export const ADS_CREDIT_COSTS = {
  image: 3,
  publish: 15,
  revise: 5,
  weeklyOptimization: 12,
  assistant: 1,
  /** Site scan + plan preview, charged only after the free daily allowance is used up. */
  scanAndPreview: 2,
} as const

export type AdsCreditAction = keyof typeof ADS_CREDIT_COSTS

export const ADS_CREDIT_ACTIONS = Object.keys(ADS_CREDIT_COSTS) as AdsCreditAction[]

export const ADS_FREE_LIMITS = {
  /** Free scan + preview actions per signed-in user per Europe/Istanbul day. */
  signedInPerDay: 3,
  /** Per anonymous cookie id per day. */
  anonPerCookiePerDay: 2,
  /** Backstop per hashed IP per day, so clearing cookies is not an unlimited bypass. */
  anonPerIpPerDay: 15,
  /** Global anonymous ceiling per day; `ADS_ANON_DAILY_CAP` overrides it. */
  anonGlobalPerDayDefault: 100,
} as const

/** Separate daily ceilings for requests that the policy model confirms are blocked. */
export const ADS_POLICY_BLOCKED_LIMITS = {
  /** Per signed-in account or anonymous cookie. */
  perIdentityPerDay: 3,
  /** Shared backstop across accounts/cookies on one client network. */
  perIpPerDay: 10,
  /** Global daily ceiling; `ADS_POLICY_BLOCKED_DAILY_CAP` overrides it. */
  globalPerDayDefault: 60,
} as const

/**
 * Ledger reason formats. They must match the regex enforced inside the RPCs:
 * `^ads:[a-z_]{1,32}:[A-Za-z0-9_-]{8,128}$`.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/
const ACTION_PATTERN = /^[a-z_]{1,32}$/

/** snake_case form of an action, as stored in the ledger reason. */
export function adsActionSlug(action: AdsCreditAction): string {
  return action.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

export function assertAdsRequestId(requestId: string): void {
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw new Error('ads request id must be 8 to 128 characters of A-Z a-z 0-9 _ -')
  }
}

export function adsChargeReason(action: AdsCreditAction, requestId: string): string {
  assertAdsRequestId(requestId)
  const slug = adsActionSlug(action)
  if (!ACTION_PATTERN.test(slug)) throw new Error('invalid ads action')
  return `ads:${slug}:${requestId}`
}

export function adsRefundReason(action: AdsCreditAction, requestId: string): string {
  return `ads_refund:${adsChargeReason(action, requestId).slice('ads:'.length)}`
}

/** True for any reason string that belongs to the ads ledger namespace. */
export function isAdsLedgerReason(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && (reason.startsWith('ads:') || reason.startsWith('ads_refund:'))
}
