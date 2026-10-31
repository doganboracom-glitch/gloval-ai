import {
  AdsProviderError,
  type AdsAccountSummary,
  type AdsApiOperationContext,
  type AdsCampaignPerformance,
  type AdsCampaignPublishInput,
  type AdsCampaignPublishResult,
  type AdsPerformanceSummary,
  type AdsProvider,
  type AdsTokenSet,
  type GoogleAdsDateRange,
  type GoogleAdsProvider,
  type GoogleAdsRefreshResult,
} from '@/lib/ads/providers/types'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'

export const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords'
export const GOOGLE_ADS_API_VERSION = 'v26'

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const GOOGLE_ADS_API_ENDPOINT = 'https://googleads.googleapis.com'
const MAX_DIRECT_ACCOUNTS = 40

export type GoogleAdsApiMethod =
  | 'customers.listAccessibleCustomers'
  | 'googleAds.search'
  | 'googleAds.searchStream'

export type GoogleAdsApiCall = {
  method: GoogleAdsApiMethod
  path: string
  accessToken: string
  loginCustomerId: string | null
  body?: { query: string }
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

    async publishCampaign(_input: AdsCampaignPublishInput): Promise<AdsCampaignPublishResult> {
      notImplemented('campaign publishing')
    },

    async setCampaignStatus() {
      notImplemented('campaign status changes')
    },

    revoke(refreshToken) {
      return revokeGoogleAdsRefreshToken(refreshToken, fetcher)
    },
  }
}
