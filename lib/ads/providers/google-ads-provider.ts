import {
  AdsProviderError,
  type AdsAccountSummary,
  type AdsApiOperationContext,
  type AdsCampaignPerformance,
  type AdsCampaignPublishInput,
  type AdsCampaignPublishResult,
  type AdsCampaignStatusResult,
  type AdsPerformanceSummary,
  type GoogleAdsAdReviewStatus,
  type GoogleAdsBillingVerification,
  type GoogleAdsCampaignManagementState,
  type GoogleAdsCampaignMutationResult,
  type AdsProvider,
  type AdsTokenSet,
  type GoogleAdsDateRange,
  type GoogleAdsProvider,
  type GoogleAdsRefreshResult,
} from '@/lib/ads/providers/types'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import {
  resolveGoogleAdsPublishAccess,
  resolveGoogleAdsValidateOnlyTestEnabled,
  resolveGoogleAdsKillSwitch,
  type GoogleAdsAccessIdentity,
} from '@/lib/ads/env'
import {
  buildGoogleAdsMutateRequest,
  parseGoogleAdsPublishPlan,
  readGoogleAdsCampaignId,
  type GoogleAdsMutateRequest,
} from '@/lib/ads/google-ads-publish-plan'

export const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords'
export const GOOGLE_ADS_API_VERSION = 'v26'

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const GOOGLE_ADS_API_ENDPOINT = 'https://googleads.googleapis.com'
const MAX_DIRECT_ACCOUNTS = 40

export type GoogleAdsApiMethod =
  | 'customers.listAccessibleCustomers'
  | 'geoTargetConstants.suggest'
  | 'googleAds.search'
  | 'googleAds.searchStream'
  | 'googleAds.mutate'
  | 'ads.mutateAds'

export type GoogleAdsAdMutateRequest = {
  operations: Record<string, unknown>[]
  partialFailure: false
  validateOnly: boolean
}

export type GoogleAdsApiCall = {
  method: GoogleAdsApiMethod
  path: string
  accessToken: string
  loginCustomerId: string | null
  body?:
    | { query: string }
    | { locale: string; countryCode: string; locationNames: { names: string[] } }
    | GoogleAdsMutateRequest
    | GoogleAdsAdMutateRequest
  context: AdsApiOperationContext
}

export type GoogleAdsApiTransport = (input: GoogleAdsApiCall) => Promise<unknown>

export type GoogleAdsProviderConfig = {
  clientId: string
  clientSecret?: string
  redirectUri?: string
  apiVersion?: string
  fetcher?: typeof fetch
  requestAdsApi?: GoogleAdsApiTransport
}

type TokenResponse = {
  access_token?: unknown
  refresh_token?: unknown
  expires_in?: unknown
  token_type?: unknown
  scope?: unknown
  error?: unknown
  error_description?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function expirationDate(expiresIn: unknown): string | null {
  const seconds = typeof expiresIn === 'number' ? expiresIn : Number(expiresIn)
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(Date.now() + seconds * 1000).toISOString()
    : null
}

function normalizeCustomerId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const id = String(value).replaceAll('-', '')
  return /^\d{6,20}$/.test(id) ? id : null
}

function searchRows(payload: unknown): Record<string, unknown>[] {
  const batches = Array.isArray(payload) ? payload : [payload]
  return batches.flatMap((batch) => {
    const record = asRecord(batch)
    return Array.isArray(record?.results)
      ? record.results.map(asRecord).filter((row): row is Record<string, unknown> => row !== null)
      : []
  })
}

function makeAccount(input: {
  id: unknown
  name: unknown
  currency: unknown
  isManager: unknown
  loginCustomerId: string | null
}): AdsAccountSummary | null {
  const externalAccountId = normalizeCustomerId(input.id)
  if (!externalAccountId) return null
  const currency = typeof input.currency === 'string' && /^[A-Z]{3}$/.test(input.currency) ? input.currency : null
  return {
    externalAccountId,
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : null,
    currency,
    isManager: input.isManager === true,
    loginCustomerId: input.loginCustomerId,
  }
}

function readCustomerAccount(row: Record<string, unknown>, loginCustomerId: string | null): AdsAccountSummary | null {
  const customer = asRecord(row.customer)
  return customer
    ? makeAccount({
        id: customer.id,
        name: customer.descriptiveName ?? customer.descriptive_name,
        currency: customer.currencyCode ?? customer.currency_code,
        isManager: customer.manager,
        loginCustomerId,
      })
    : null
}

function normalizeGeoName(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('tr').trim()
}

async function resolveCityGeoTargetResources(input: {
  requestAdsApi: GoogleAdsApiTransport
  accessToken: string
  context: AdsApiOperationContext
  plan: ReturnType<typeof parseGoogleAdsPublishPlan>
}): Promise<string[]> {
  if (input.plan.cities.length === 0) return []

  const payload = asRecord(await input.requestAdsApi({
    method: 'geoTargetConstants.suggest',
    path: 'geoTargetConstants:suggest',
    accessToken: input.accessToken,
    loginCustomerId: null,
    body: {
      locale: input.plan.language,
      countryCode: input.plan.country,
      locationNames: { names: input.plan.cities },
    },
    context: input.context,
  }))
  const suggestions = Array.isArray(payload?.geoTargetConstantSuggestions)
    ? payload.geoTargetConstantSuggestions
    : []
  const resources: string[] = []

  for (const city of input.plan.cities) {
    const matches = suggestions.flatMap((value) => {
      const suggestion = asRecord(value)
      const location = asRecord(suggestion?.geoTargetConstant ?? suggestion?.geo_target_constant)
      const name = location?.name
      const countryCode = location?.countryCode ?? location?.country_code
      const targetType = location?.targetType ?? location?.target_type
      const status = location?.status
      const resourceName = location?.resourceName ?? location?.resource_name
      return typeof name === 'string' && normalizeGeoName(name) === normalizeGeoName(city) &&
        countryCode === input.plan.country && targetType === 'City' && status === 'ENABLED' &&
        typeof resourceName === 'string' && /^geoTargetConstants\/\d{1,20}$/.test(resourceName)
        ? [resourceName]
        : []
    })
    const uniqueMatches = [...new Set(matches)]
    if (uniqueMatches.length !== 1) throw new GoogleAdsError('invalid_publish_plan')
    resources.push(uniqueMatches[0])
  }

  return [...new Set(resources)]
}

function readClientAccount(row: Record<string, unknown>, loginCustomerId: string): AdsAccountSummary | null {
  const client = asRecord(row.customerClient ?? row.customer_client)
  const resourceName = typeof client?.clientCustomer === 'string'
    ? client.clientCustomer
    : typeof client?.client_customer === 'string'
      ? client.client_customer
      : null
  const resourceId = resourceName ? /^(?:customers\/)?([0-9-]+)$/.exec(resourceName)?.[1] : null
  return client
    ? makeAccount({
        id: resourceId ?? client.id,
        name: client.descriptiveName ?? client.descriptive_name,
        currency: client.currencyCode ?? client.currency_code,
        isManager: client.manager,
        loginCustomerId,
      })
    : null
}

async function parseTokenResponse(response: Response): Promise<TokenResponse> {
  const body = asRecord(await response.json().catch(() => null))
  if (!body) throw new GoogleAdsError('oauth_failed')
  if (!response.ok) {
    if (body.error === 'invalid_grant') throw new GoogleAdsError('reauth_required')
    throw new GoogleAdsError('oauth_failed')
  }
  return body as TokenResponse
}

function requireClientSecret(config: GoogleAdsProviderConfig): string {
  if (!config.clientId || !config.clientSecret) throw new GoogleAdsError('configuration_missing')
  return config.clientSecret
}

function requireApiTransport(config: GoogleAdsProviderConfig): GoogleAdsApiTransport {
  if (!config.requestAdsApi) throw new GoogleAdsError('configuration_missing')
  return config.requestAdsApi
}

function requirePublishAccess(
  userId: string,
  validationTestMode = false,
  identity?: GoogleAdsAccessIdentity,
): void {
  if (validationTestMode) {
    if (!resolveGoogleAdsValidateOnlyTestEnabled()) throw new GoogleAdsError('publish_disabled')
    return
  }
  if (!resolveGoogleAdsPublishAccess(userId, process.env, identity)) throw new GoogleAdsError('publish_disabled')
}

function handleProviderError(error: unknown): never {
  if (error instanceof GoogleAdsError || error instanceof AdsProviderError) throw error
  throw new GoogleAdsError('provider_unavailable')
}

function notImplemented(operation: string): never {
  throw new AdsProviderError('not_implemented', `Google Ads ${operation} is not implemented`)
}

export async function revokeGoogleAdsRefreshToken(
  refreshToken: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!refreshToken) return

  let response: Response
  try {
    response = await fetcher(GOOGLE_REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }).toString(),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new GoogleAdsError('disconnect_failed')
  }

  if (response.ok) return
  const body = asRecord(await response.json().catch(() => null))
  if (response.status === 400 && body?.error === 'invalid_token') return
  throw new GoogleAdsError('disconnect_failed')
}

export function createGoogleAdsProvider(config: GoogleAdsProviderConfig): GoogleAdsProvider {
  const fetcher = config.fetcher ?? fetch
  const apiVersion = config.apiVersion ?? GOOGLE_ADS_API_VERSION

  const exchangeCodeWithVerifier: GoogleAdsProvider['exchangeCodeWithVerifier'] = async ({
    code,
    redirectUri,
    codeVerifier,
  }) => {
    if (!code || !codeVerifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) {
      throw new GoogleAdsError('invalid_request')
    }
    if (config.redirectUri && redirectUri !== config.redirectUri) throw new GoogleAdsError('invalid_request')

    try {
      const response = await fetcher(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: requireClientSecret(config),
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }).toString(),
        signal: AbortSignal.timeout(15_000),
      })
      const body = await parseTokenResponse(response)
      if (typeof body.access_token !== 'string' || !body.access_token || body.token_type !== 'Bearer') {
        throw new GoogleAdsError('oauth_failed')
      }
      if (typeof body.refresh_token !== 'string' || !body.refresh_token) {
        throw new GoogleAdsError('refresh_token_missing')
      }
      const scopes = typeof body.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : []
      if (!scopes.includes(GOOGLE_ADS_SCOPE)) throw new GoogleAdsError('scope_missing')

      return {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresAt: expirationDate(body.expires_in),
        scopes,
      }
    } catch (error) {
      handleProviderError(error)
    }
  }

  const refreshAccessTokenWithRotation: GoogleAdsProvider['refreshAccessTokenWithRotation'] = async (
    refreshToken,
  ): Promise<GoogleAdsRefreshResult> => {
    if (!refreshToken) throw new GoogleAdsError('reauth_required')

    try {
      const response = await fetcher(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: requireClientSecret(config),
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
        signal: AbortSignal.timeout(15_000),
      })
      const body = await parseTokenResponse(response)
      if (typeof body.access_token !== 'string' || !body.access_token || body.token_type !== 'Bearer') {
        throw new GoogleAdsError('provider_error')
      }
      return {
        accessToken: body.access_token,
        expiresAt: expirationDate(body.expires_in),
        refreshToken: typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : null,
      }
    } catch (error) {
      handleProviderError(error)
    }
  }

  const listAccountsForUser: GoogleAdsProvider['listAccountsForUser'] = async (accessToken, context) => {
    const requestAdsApi = requireApiTransport(config)
    if (!accessToken) throw new GoogleAdsError('reauth_required')

    try {
      const accessible = asRecord(await requestAdsApi({
        method: 'customers.listAccessibleCustomers',
        path: 'customers:listAccessibleCustomers',
        accessToken,
        loginCustomerId: null,
        context,
      }))
      const resourceNames = Array.isArray(accessible?.resourceNames)
        ? accessible.resourceNames
        : Array.isArray(accessible?.resource_names)
          ? accessible.resource_names
          : []
      const roots = resourceNames
        .map((name) => typeof name === 'string' ? /^(?:customers\/)?([0-9-]+)$/.exec(name)?.[1] : null)
        .map(normalizeCustomerId)
        .filter((id): id is string => id !== null)

      if (roots.length === 0) throw new GoogleAdsError('no_accounts')
      if (roots.length > MAX_DIRECT_ACCOUNTS) throw new GoogleAdsError('account_list_failed')

      const accounts = new Map<string, AdsAccountSummary>()
      for (const rootId of roots) {
        const customerPayload = await requestAdsApi({
          method: 'googleAds.searchStream',
          path: `customers/${rootId}/googleAds:searchStream`,
          accessToken,
          loginCustomerId: null,
          body: {
            query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer',
          },
          context,
        })
        const rootAccount = searchRows(customerPayload)
          .map((row) => readCustomerAccount(row, null))
          .find((account): account is AdsAccountSummary => account !== null)
        if (!rootAccount) continue
        accounts.set(rootAccount.externalAccountId, rootAccount)

        if (!rootAccount.isManager) continue
        const clientsPayload = await requestAdsApi({
          method: 'googleAds.searchStream',
          path: `customers/${rootId}/googleAds:searchStream`,
          accessToken,
          loginCustomerId: rootId,
          body: {
            query: 'SELECT customer_client.client_customer, customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager, customer_client.level FROM customer_client WHERE customer_client.level > 0',
          },
          context,
        })
        for (const row of searchRows(clientsPayload)) {
          const account = readClientAccount(row, rootId)
          if (!account) continue
          const existing = accounts.get(account.externalAccountId)
          if (!existing || (existing.loginCustomerId && !account.loginCustomerId)) {
            accounts.set(account.externalAccountId, account)
          }
        }
      }

      return [...accounts.values()].sort((left, right) => {
        if (left.isManager !== right.isManager) return left.isManager ? -1 : 1
        return (left.name ?? left.externalAccountId).localeCompare(right.name ?? right.externalAccountId)
      })
    } catch (error) {
      handleProviderError(error)
    }
  }

  const verifyBilling: GoogleAdsProvider['verifyBilling'] = async ({
    accessToken,
    customerId,
    loginCustomerId,
    context,
  }): Promise<GoogleAdsBillingVerification> => {
    const notVerified = { verified: false, paymentMethodWarning: true }
    const normalizedCustomerId = normalizeCustomerId(customerId)
    if (!normalizedCustomerId || !accessToken) return notVerified
    if (loginCustomerId && !normalizeCustomerId(loginCustomerId)) return notVerified

    try {
      const payload = await requireApiTransport(config)({
        method: 'googleAds.searchStream',
        path: `customers/${normalizedCustomerId}/googleAds:searchStream`,
        accessToken,
        loginCustomerId: loginCustomerId ? normalizeCustomerId(loginCustomerId) : null,
        body: {
          query: "SELECT billing_setup.status FROM billing_setup WHERE billing_setup.status = 'APPROVED' LIMIT 1",
        },
        context,
      })
      const verified = searchRows(payload).some((row) => {
        const setup = asRecord(row.billingSetup ?? row.billing_setup)
        return setup?.status === 'APPROVED'
      })
      return { verified, paymentMethodWarning: !verified }
    } catch {
      return notVerified
    }
  }

  const getAdReviewStatus: GoogleAdsProvider['getAdReviewStatus'] = async ({
    accessToken,
    customerId,
    loginCustomerId,
    campaignId,
    context,
  }): Promise<GoogleAdsAdReviewStatus> => {
    requirePublishAccess(context.userId, false, context.googleAdsAccess)
    const normalizedCustomerId = normalizeCustomerId(customerId)
    if (!normalizedCustomerId || !accessToken || !context.connectionId || !/^\d{1,20}$/.test(campaignId)) {
      throw new GoogleAdsError('invalid_request')
    }
    const normalizedLoginCustomerId = loginCustomerId ? normalizeCustomerId(loginCustomerId) : null
    if (loginCustomerId && !normalizedLoginCustomerId) throw new GoogleAdsError('invalid_request')

    try {
      const payload = await requireApiTransport(config)({
        method: 'googleAds.searchStream',
        path: `customers/${normalizedCustomerId}/googleAds:searchStream`,
        accessToken,
        loginCustomerId: normalizedLoginCustomerId,
        body: {
          query: `SELECT ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status FROM ad_group_ad WHERE campaign.id = ${campaignId} AND ad_group_ad.status != 'REMOVED'`,
        },
        context,
      })
      const rows = searchRows(payload)
      if (rows.length === 0) return { status: 'unavailable', adCount: 0 }

      let unavailable = false
      for (const row of rows) {
        const ad = asRecord(row.adGroupAd ?? row.ad_group_ad)
        const policy = asRecord(ad?.policySummary ?? ad?.policy_summary)
        const approval = policy?.approvalStatus ?? policy?.approval_status
        const review = policy?.reviewStatus ?? policy?.review_status
        if (approval === 'DISAPPROVED') return { status: 'disapproved', adCount: rows.length }
        if (review === 'REVIEW_IN_PROGRESS' || approval === 'UNDER_REVIEW') {
          return { status: 'review_in_progress', adCount: rows.length }
        }
        if (
          typeof approval !== 'string' ||
          typeof review !== 'string' ||
          approval === 'UNKNOWN' ||
          approval === 'UNREVIEWED' ||
          review === 'UNKNOWN'
        ) {
          unavailable = true
        }
      }

      return { status: unavailable ? 'unavailable' : 'approved', adCount: rows.length }
    } catch (error) {
      handleProviderError(error)
    }
  }

  const getPerformance: GoogleAdsProvider['getPerformance'] = async ({
    accessToken,
    customerId,
    loginCustomerId,
    range,
    currency,
    context,
  }): Promise<AdsPerformanceSummary> => {
    const requestAdsApi = requireApiTransport(config)
    if (!normalizeCustomerId(customerId)) throw new GoogleAdsError('invalid_request')
    if (loginCustomerId && !normalizeCustomerId(loginCustomerId)) throw new GoogleAdsError('invalid_request')
    if (!accessToken) throw new GoogleAdsError('reauth_required')

    try {
      const duration = range === '30d' ? 'LAST_30_DAYS' : 'LAST_7_DAYS'
      const payload = await requestAdsApi({
        method: 'googleAds.searchStream',
        path: `customers/${normalizeCustomerId(customerId)}/googleAds:searchStream`,
        accessToken,
        loginCustomerId: loginCustomerId ? normalizeCustomerId(loginCustomerId) : null,
        body: {
          query: `SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING ${duration} AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 100`,
        },
        context,
      })

      const campaigns: AdsCampaignPerformance[] = searchRows(payload).flatMap((row) => {
        const campaign = asRecord(row.campaign)
        const metrics = asRecord(row.metrics)
        if (!campaign || !metrics) return []
        const id = String(campaign.id ?? '')
        if (!/^\d{1,20}$/.test(id)) return []
        const status = campaign.status === 'ENABLED' || campaign.status === 'PAUSED'
          ? campaign.status
          : 'UNKNOWN'
        const safeNumber = (value: unknown) => {
          const parsed = typeof value === 'number' ? value : Number(value ?? 0)
          return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
        }
        return [{
          id,
          name: typeof campaign.name === 'string' ? campaign.name : '',
          status,
          impressions: safeNumber(metrics.impressions),
          clicks: safeNumber(metrics.clicks),
          costMicros: safeNumber(metrics.costMicros ?? metrics.cost_micros),
          conversions: safeNumber(metrics.conversions),
        }]
      })

      const totals = campaigns.reduce(
        (sum, campaign) => ({
          impressions: sum.impressions + campaign.impressions,
          clicks: sum.clicks + campaign.clicks,
          costMicros: sum.costMicros + campaign.costMicros,
          conversions: sum.conversions + campaign.conversions,
        }),
        { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 },
      )

      return { range, currency, totals, campaigns }
    } catch (error) {
      handleProviderError(error)
    }
  }

  return {
    platform: 'google_ads',
    status: 'available',
    displayName: 'Google Ads',

    buildAuthUrl({ state, redirectUri, codeChallenge }) {
      if (!config.clientId) throw new GoogleAdsError('configuration_missing')
      if (!state || !codeChallenge) throw new GoogleAdsError('invalid_request')
      const url = new URL(GOOGLE_AUTH_ENDPOINT)
      url.searchParams.set('client_id', config.clientId)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', GOOGLE_ADS_SCOPE)
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'consent')
      url.searchParams.set('include_granted_scopes', 'false')
      url.searchParams.set('code_challenge', codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('state', state)
      return url.toString()
    },

    async exchangeCode(input) {
      if (!input.codeVerifier) throw new GoogleAdsError('invalid_request')
      return exchangeCodeWithVerifier({ ...input, codeVerifier: input.codeVerifier })
    },

    exchangeCodeWithVerifier,

    async refreshAccessToken(refreshToken) {
      const result = await refreshAccessTokenWithRotation(refreshToken)
      return { accessToken: result.accessToken, expiresAt: result.expiresAt }
    },

    refreshAccessTokenWithRotation,

    async listAccounts(accessToken, context) {
      if (!context) throw new GoogleAdsError('invalid_request')
      return listAccountsForUser(accessToken, context)
    },

    listAccountsForUser,
    getPerformance,
    getAdReviewStatus,
    verifyBilling,

    async getCampaignManagementState(input): Promise<GoogleAdsCampaignManagementState> {
      requirePublishAccess(input.context.userId)
      const customerId = normalizeCustomerId(input.customerId)
      if (!customerId || !input.accessToken || !input.context.connectionId || !/^\d{1,20}$/.test(input.campaignId)) {
        throw new GoogleAdsError('invalid_request')
      }
      if (input.loginCustomerId && !normalizeCustomerId(input.loginCustomerId)) {
        throw new GoogleAdsError('invalid_request')
      }
      const payload = await requireApiTransport(config)({
        method: 'googleAds.searchStream',
        path: `customers/${customerId}/googleAds:searchStream`,
        accessToken: input.accessToken,
        loginCustomerId: input.loginCustomerId ? normalizeCustomerId(input.loginCustomerId) : null,
        body: {
          query: `SELECT campaign.id, campaign.status, campaign_budget.resource_name, campaign_budget.amount_micros, ad_group_ad.ad.resource_name, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad WHERE campaign.id = ${input.campaignId} AND ad_group_ad.status != 'REMOVED' AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD' ORDER BY ad_group_ad.ad.id LIMIT 1`,
        },
        context: input.context,
      })
      const row = searchRows(payload)[0]
      const campaign = asRecord(row?.campaign)
      const budget = asRecord(row?.campaignBudget ?? row?.campaign_budget)
      const adGroupAd = asRecord(row?.adGroupAd ?? row?.ad_group_ad)
      const ad = asRecord(adGroupAd?.ad)
      const responsive = asRecord(ad?.responsiveSearchAd ?? ad?.responsive_search_ad)
      const budgetResourceName = budget?.resourceName ?? budget?.resource_name
      const dailyBudgetMicros = budget?.amountMicros ?? budget?.amount_micros
      const adResourceName = ad?.resourceName ?? ad?.resource_name
      if (
        !campaign || String(campaign.id ?? '') !== input.campaignId ||
        typeof budgetResourceName !== 'string' ||
        (typeof dailyBudgetMicros !== 'string' && typeof dailyBudgetMicros !== 'number') ||
        !/^\d{1,20}$/.test(String(dailyBudgetMicros)) ||
        typeof adResourceName !== 'string' ||
        !new RegExp(`^customers/${customerId}/ads/\\d{1,20}$`).test(adResourceName) ||
        !responsive
      ) {
        throw new GoogleAdsError('provider_unavailable')
      }
      const assetTexts = (value: unknown) => Array.isArray(value)
        ? value.flatMap((asset) => {
            const text = asRecord(asset)?.text
            return typeof text === 'string' ? [text] : []
          })
        : []
      return {
        campaignId: input.campaignId,
        campaignStatus: campaign.status === 'ENABLED' || campaign.status === 'PAUSED' ? campaign.status : 'UNKNOWN',
        budgetResourceName,
        dailyBudgetMicros: String(dailyBudgetMicros),
        adResourceName,
        headlines: assetTexts(responsive.headlines),
        descriptions: assetTexts(responsive.descriptions),
      }
    },

    async updateCampaignBudget(input): Promise<GoogleAdsCampaignMutationResult> {
      requirePublishAccess(input.context.userId)
      if (input.userConfirmed !== true) throw new GoogleAdsError('confirmation_required')
      const customerId = normalizeCustomerId(input.customerId)
      if (
        !customerId || !input.accessToken || !input.context.connectionId ||
        !/^\d{1,20}$/.test(input.dailyBudgetMicros) || Number(input.dailyBudgetMicros) <= 0 ||
        !new RegExp(`^customers/${customerId}/campaignBudgets/\\d{1,20}$`).test(input.budgetResourceName)
      ) {
        throw new GoogleAdsError('invalid_budget')
      }
      await requireApiTransport(config)({
        method: 'googleAds.mutate',
        path: `customers/${customerId}/googleAds:mutate`,
        accessToken: input.accessToken,
        loginCustomerId: input.loginCustomerId ? normalizeCustomerId(input.loginCustomerId) : null,
        body: {
          mutateOperations: [{
            campaignBudgetOperation: {
              update: { resourceName: input.budgetResourceName, amountMicros: input.dailyBudgetMicros },
              updateMask: 'amountMicros',
            },
          }],
          partialFailure: false,
          validateOnly: input.validateOnly,
        },
        context: input.context,
      })
      return { validateOnly: input.validateOnly, billingVerified: null, paymentMethodWarning: false }
    },

    async updateResponsiveSearchAd(input): Promise<GoogleAdsCampaignMutationResult> {
      requirePublishAccess(input.context.userId)
      if (input.userConfirmed !== true) throw new GoogleAdsError('confirmation_required')
      const customerId = normalizeCustomerId(input.customerId)
      if (!customerId || !input.accessToken || !input.context.connectionId) throw new GoogleAdsError('invalid_request')
      if (!new RegExp(`^customers/${customerId}/ads/\\d{1,20}$`).test(input.adResourceName)) {
        throw new GoogleAdsError('invalid_request')
      }
      if (
        input.headlines.length < 3 || input.headlines.length > 15 ||
        input.headlines.some((text) => !text.trim() || text.length > 30) ||
        input.descriptions.length < 2 || input.descriptions.length > 4 ||
        input.descriptions.some((text) => !text.trim() || text.length > 90)
      ) {
        throw new GoogleAdsError('invalid_publish_plan')
      }
      await requireApiTransport(config)({
        method: 'ads.mutateAds',
        path: `customers/${customerId}/ads:mutate`,
        accessToken: input.accessToken,
        loginCustomerId: input.loginCustomerId ? normalizeCustomerId(input.loginCustomerId) : null,
        body: {
          operations: [{
            adOperation: {
              update: {
                resourceName: input.adResourceName,
                responsiveSearchAd: {
                  headlines: input.headlines.map((text) => ({ text })),
                  descriptions: input.descriptions.map((text) => ({ text })),
                },
              },
              updateMask: 'responsiveSearchAd.headlines,responsiveSearchAd.descriptions',
            },
          }],
          partialFailure: false,
          validateOnly: input.validateOnly,
        },
        context: input.context,
      })
      return { validateOnly: input.validateOnly, billingVerified: null, paymentMethodWarning: false }
    },

    async publishCampaign(input: AdsCampaignPublishInput): Promise<AdsCampaignPublishResult> {
      const validationTestMode = input.validationTestMode === true
      if (validationTestMode && !input.validateOnly) throw new GoogleAdsError('invalid_request')
      requirePublishAccess(input.context.userId, validationTestMode, input.context.googleAdsAccess)
      const customerId = normalizeCustomerId(input.externalAccountId)
      if (!customerId || !input.accessToken || !input.context.connectionId) {
        throw new GoogleAdsError('invalid_request')
      }
      if (input.loginCustomerId && !normalizeCustomerId(input.loginCustomerId)) {
        throw new GoogleAdsError('invalid_request')
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.planId)) {
        throw new GoogleAdsError('invalid_request')
      }

      if (input.userConfirmed !== true) throw new GoogleAdsError('confirmation_required')
      const plan = parseGoogleAdsPublishPlan(input.planJson)
      const geoTargetResourceNames = await resolveCityGeoTargetResources({
        requestAdsApi: requireApiTransport(config),
        accessToken: input.accessToken,
        context: input.context,
        plan,
      })
      const body = buildGoogleAdsMutateRequest({
        customerId,
        requestId: input.requestId,
        planJson: input.planJson,
        dailyBudgetMinor: input.budget.dailyMinor,
        budgetCapMinor: input.budget.capMinor,
        currency: input.budget.currency,
        validateOnly: input.validateOnly,
        ...(geoTargetResourceNames.length > 0 ? { geoTargetResourceNames } : {}),
      })
      const billing = await verifyBilling({
        accessToken: input.accessToken,
        customerId,
        loginCustomerId: input.loginCustomerId,
        context: input.context,
      })

      try {
        const payload = await requireApiTransport(config)({
          method: 'googleAds.mutate',
          path: `customers/${customerId}/googleAds:mutate`,
          accessToken: input.accessToken,
          loginCustomerId: input.loginCustomerId ? normalizeCustomerId(input.loginCustomerId) : null,
          body,
          context: input.context,
        })
        const externalCampaignId = input.validateOnly ? null : readGoogleAdsCampaignId(payload)
        if (!input.validateOnly && !externalCampaignId) throw new GoogleAdsError('provider_unavailable')
        return {
          externalCampaignId,
          status: 'paused',
          validateOnly: input.validateOnly,
          billingVerified: billing.verified,
          paymentMethodWarning: billing.paymentMethodWarning,
        }
      } catch (error) {
        handleProviderError(error)
      }
    },

    async setCampaignStatus(input): Promise<AdsCampaignStatusResult> {
      requirePublishAccess(input.context.userId)
      if (input.userConfirmed !== true) throw new GoogleAdsError('confirmation_required')
      const customerId = normalizeCustomerId(input.externalAccountId)
      if (!customerId || !input.accessToken || !input.context.connectionId) {
        throw new GoogleAdsError('invalid_request')
      }
      if (input.loginCustomerId && !normalizeCustomerId(input.loginCustomerId)) {
        throw new GoogleAdsError('invalid_request')
      }
      if (!/^\d{1,20}$/.test(input.externalCampaignId)) throw new GoogleAdsError('invalid_request')

      const billing = input.status === 'enabled'
        ? await verifyBilling({
            accessToken: input.accessToken,
            customerId,
            loginCustomerId: input.loginCustomerId,
            context: input.context,
          })
        : null
      const resourceName = `customers/${customerId}/campaigns/${input.externalCampaignId}`

      try {
        await requireApiTransport(config)({
          method: 'googleAds.mutate',
          path: `customers/${customerId}/googleAds:mutate`,
          accessToken: input.accessToken,
          loginCustomerId: input.loginCustomerId ? normalizeCustomerId(input.loginCustomerId) : null,
          body: {
            mutateOperations: [{
              campaignOperation: {
                update: { resourceName, status: input.status === 'enabled' ? 'ENABLED' : 'PAUSED' },
                updateMask: 'status',
              },
            }],
            partialFailure: false,
            validateOnly: input.validateOnly,
          },
          context: input.context,
        })
        return {
          status: input.status,
          validateOnly: input.validateOnly,
          billingVerified: billing?.verified ?? null,
          paymentMethodWarning: billing?.paymentMethodWarning ?? false,
        }
      } catch (error) {
        handleProviderError(error)
      }
    },


    revoke(refreshToken) {
      return revokeGoogleAdsRefreshToken(refreshToken, fetcher)
    },
  }
}
