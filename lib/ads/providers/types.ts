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

export type AdsApiOperationContext = {
  userId: string
  connectionId: string | null
}

export type GoogleAdsDateRange = '7d' | '30d'

export type AdsCampaignPerformance = {
  id: string
  name: string
  status: 'ENABLED' | 'PAUSED' | 'UNKNOWN'
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
}

export type AdsPerformanceSummary = {
  range: GoogleAdsDateRange
  currency: string | null
  totals: Omit<AdsCampaignPerformance, 'id' | 'name' | 'status'>
  campaigns: AdsCampaignPerformance[]
}

export type GoogleAdsRefreshResult = {
  accessToken: string
  expiresAt: string | null
  refreshToken: string | null
}

/** Money is always in minor units (kuruş) plus an ISO 4217 code. */
export type AdsBudgetMinor = { currency: string; dailyMinor: number; capMinor: number }

export type AdsCampaignPublishInput = {
  externalAccountId: string
  loginCustomerId: string | null
  accessToken: string
  planId: string
  /** Idempotency key: a retry with the same value must not create a second campaign. */
  requestId: string
  budget: AdsBudgetMinor
  /** Provider-neutral campaign body, validated by the plan schema before it gets here. */
  campaign: Record<string, unknown>
}

export type AdsCampaignPublishResult = {
  externalCampaignId: string
  status: 'paused' | 'enabled'
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
    externalCampaignId: string
    status: 'paused' | 'enabled'
  }): Promise<void>
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
  getPerformance(input: {
    accessToken: string
    customerId: string
    loginCustomerId: string | null
    range: GoogleAdsDateRange
    currency: string | null
    context: AdsApiOperationContext
  }): Promise<AdsPerformanceSummary>
}
