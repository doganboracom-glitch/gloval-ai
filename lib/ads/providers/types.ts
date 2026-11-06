export const ADS_PLATFORMS = ['google_ads', 'meta', 'tiktok', 'linkedin', 'x'] as const
export type AdsPlatform = (typeof ADS_PLATFORMS)[number]

/** `coming_soon` providers are listed in the UI but can never be connected or published to. */
export type AdsProviderStatus = 'available' | 'coming_soon'

export type AdsProviderErrorCode =
  | 'not_implemented'
  | 'coming_soon'
  | 'invalid_input'
  | 'auth_failed'
  | 'rate_limited'
  | 'provider_error'

export class AdsProviderError extends Error {
  readonly code: AdsProviderErrorCode
  constructor(code: AdsProviderErrorCode, message: string) {
    super(message)
    this.name = 'AdsProviderError'
    this.code = code
  }
}

export type AdsOAuthStartInput = {
  state: string
  redirectUri: string
  codeChallenge?: string
}

export type AdsTokenSet = {
  accessToken: string
  /** Stored only after `lib/ads/token-crypto.ts` encrypts it. */
  refreshToken: string
  expiresAt: string | null
  scopes: string[]
}

export type AdsAccountSummary = {
  externalAccountId: string
  name: string | null
  currency: string | null
  isManager: boolean
  loginCustomerId: string | null
}

import type { GoogleAdsAccessIdentity } from '@/lib/ads/env'

export type AdsApiOperationContext = {
  userId: string
  connectionId: string | null
  googleAdsAccess?: GoogleAdsAccessIdentity
}

export type GoogleAdsDateRange = '7d' | '30d'

export type AdsPerformanceMetrics = {
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
}

export type AdsCampaignPerformance = AdsPerformanceMetrics & {
  id: string
  name: string
  status: string
  previous?: AdsPerformanceMetrics
}

export type AdsPerformanceSummary = {
  range: GoogleAdsDateRange
  currency: string | null
  totals: AdsPerformanceMetrics
  previousTotals?: AdsPerformanceMetrics
  campaigns: AdsCampaignPerformance[]
}

export type AdsCampaignPerformanceRow = AdsCampaignPerformance & {
  platform: string
  accountId: string
  accountName: string | null
}

export type GoogleAdsRefreshResult = {
  accessToken: string
  expiresAt: string | null
  refreshToken: string | null
}

/** Daily budgets use positive currency minor units plus an ISO 4217 code. */
export type AdsBudgetMinor = { currency: string; dailyMinor: number }

export type AdsCampaignPublishInput = {
  externalAccountId: string
  loginCustomerId: string | null
  accessToken: string
  context: AdsApiOperationContext
  planId: string
  /** Created server-side and persisted before the external mutate request. */
  requestId: string
  budget: AdsBudgetMinor
  /** Persisted, validated plan JSON; provider code builds every mutate body from it. */
  planJson: unknown
  validateOnly: boolean
  /** Allows the dedicated server-side admin test route to bypass the live-publish gate, only with validateOnly=true. */
  validationTestMode?: boolean
  userConfirmed: boolean
}

export type AdsCampaignPublishResult = {
  externalCampaignId: string | null
  status: 'paused'
  validateOnly: boolean
  billingVerified: boolean
  paymentMethodWarning: boolean
}

export type AdsCampaignStatusResult = {
  status: 'paused' | 'enabled'
  validateOnly: boolean
  billingVerified: boolean | null
  paymentMethodWarning: boolean
}

export type GoogleAdsAdReviewStatus = {
  status: 'approved' | 'disapproved' | 'review_in_progress' | 'unavailable'
  adCount: number
}

export type GoogleAdsBillingVerification = {
  verified: boolean
  paymentMethodWarning: boolean
}

export type GoogleAdsKeywordMatchType = 'EXACT' | 'PHRASE' | 'BROAD'

export type GoogleAdsCampaignKeyword = {
  resourceName: string
  text: string
  matchType: GoogleAdsKeywordMatchType
  negative: boolean
}

export type GoogleAdsCampaignManagementState = {
  campaignId: string
  campaignStatus: 'PAUSED' | 'ENABLED' | 'REMOVED' | 'UNKNOWN'
  budgetResourceName: string
  dailyBudgetMicros: string
  adResourceName: string
  adGroupResourceName?: string
  keywords?: GoogleAdsCampaignKeyword[]
  headlines: string[]
  descriptions: string[]
}

export type GoogleAdsCampaignMutationResult = {
  validateOnly: boolean
  billingVerified: boolean | null
  paymentMethodWarning: boolean
  status?: 'paused' | 'enabled'
}

export interface AdsProvider {
  readonly platform: AdsPlatform
  readonly status: AdsProviderStatus
  readonly displayName: string

  buildAuthUrl(input: AdsOAuthStartInput): string
  exchangeCode(input: { code: string; redirectUri: string; codeVerifier?: string }): Promise<AdsTokenSet>
  refreshAccessToken(refreshToken: string): Promise<Pick<AdsTokenSet, 'accessToken' | 'expiresAt'>>
  listAccounts(accessToken: string, context?: AdsApiOperationContext): Promise<AdsAccountSummary[]>
  publishCampaign(input: AdsCampaignPublishInput): Promise<AdsCampaignPublishResult>
  setCampaignStatus(input: {
    externalAccountId: string
    loginCustomerId: string | null
    accessToken: string
    context: AdsApiOperationContext
    externalCampaignId: string
    status: 'paused' | 'enabled'
    validateOnly: boolean
    userConfirmed: boolean
  }): Promise<AdsCampaignStatusResult>
  revoke(refreshToken: string): Promise<void>
}

export interface GoogleAdsProvider extends AdsProvider {
  exchangeCodeWithVerifier(input: {
    code: string
    redirectUri: string
    codeVerifier: string
  }): Promise<AdsTokenSet>
  refreshAccessTokenWithRotation(refreshToken: string): Promise<GoogleAdsRefreshResult>
  listAccountsForUser(
    accessToken: string,
    context: AdsApiOperationContext,
  ): Promise<AdsAccountSummary[]>
  verifyBilling(input: {
    accessToken: string
    customerId: string
    loginCustomerId: string | null
    context: AdsApiOperationContext
  }): Promise<GoogleAdsBillingVerification>
  getAdReviewStatus(input: {
    accessToken: string
    customerId: string
    loginCustomerId: string | null
    campaignId: string
    context: AdsApiOperationContext
  }): Promise<GoogleAdsAdReviewStatus>
  getCampaignManagementState(input: {
    accessToken: string
    customerId: string
    loginCustomerId: string | null
    campaignId: string
    context: AdsApiOperationContext
  }): Promise<GoogleAdsCampaignManagementState>
  updateCampaignBudget(input: {
    accessToken: string
    customerId: string
    loginCustomerId: string | null
    context: AdsApiOperationContext
    budgetResourceName: string
    dailyBudgetMicros: string
    validateOnly: boolean
    userConfirmed: boolean
  }): Promise<GoogleAdsCampaignMutationResult>
  updateResponsiveSearchAd(input: {
    accessToken: string
    customerId: string
    loginCustomerId: string | null
    context: AdsApiOperationContext
    adResourceName: string
    headlines: string[]
    descriptions: string[]
    validateOnly: boolean
    userConfirmed: boolean
  }): Promise<GoogleAdsCampaignMutationResult>
  mutateKeyword?(input: {
    accessToken: string
    customerId: string
    loginCustomerId: string | null
    context: AdsApiOperationContext
    operation: 'add' | 'remove'
    campaignId: string
    adGroupResourceName: string | null
    keywordResourceName?: string
    keywordText?: string
    matchType?: 'EXACT' | 'PHRASE'
    negative?: boolean
    validateOnly: boolean
    userConfirmed: boolean
  }): Promise<GoogleAdsCampaignMutationResult>
  removeCampaign?(input: {
    accessToken: string
    customerId: string
    loginCustomerId: string | null
    context: AdsApiOperationContext
    campaignId: string
    validateOnly: boolean
    userConfirmed: boolean
  }): Promise<GoogleAdsCampaignMutationResult>
  getPerformance(input: {
    accessToken: string
    customerId: string
    loginCustomerId: string | null
    range: GoogleAdsDateRange
    currency: string | null
    context: AdsApiOperationContext
  }): Promise<AdsPerformanceSummary>
}
