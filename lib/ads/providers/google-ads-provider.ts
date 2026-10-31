import { AdsProviderError, type AdsAccountSummary, type AdsProvider, type AdsTokenSet } from '@/lib/ads/providers/types'
import type { GoogleAdsApiMethod, GoogleAdsApiRequestWrapper } from '@/lib/ads/google-ads-operations'

export const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords'
export const GOOGLE_ADS_API_VERSION = 'v26'
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const GOOGLE_ADS_API_ENDPOINT = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`

export type GoogleAdsProviderConfig = {
  clientId: string
  clientSecret?: string
  fetchImpl?: typeof fetch
  withApiRequest?: GoogleAdsApiRequestWrapper
}

type JsonObject = Record<string, unknown>
type TokenPayload = JsonObject & {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

function providerErrorForStatus(status: number): AdsProviderError {
  if (status === 401 || status === 403) return new AdsProviderError('auth_failed', 'Google Ads authorization failed')
  if (status === 429) return new AdsProviderError('rate_limited', 'Google Ads request limit reached')
  return new AdsProviderError('provider_error', 'Google Ads provider rejected the request')
}

async function readJsonResponse(response: Response): Promise<JsonObject | JsonObject[]> {
  if (!response.ok) throw providerErrorForStatus(response.status)
  const text = await response.text()
  if (!text) return {}

  try {
    const payload: unknown = JSON.parse(text)
    if (Array.isArray(payload)) return payload as JsonObject[]
    if (payload && typeof payload === 'object') return payload as JsonObject
  } catch {
    throw new AdsProviderError('provider_error', 'Google Ads provider returned invalid JSON')
  }

  throw new AdsProviderError('provider_error', 'Google Ads provider returned an invalid response')
}

function getFetcher(config: GoogleAdsProviderConfig): typeof fetch {
  return config.fetchImpl ?? fetch
}

async function fetchJson(config: GoogleAdsProviderConfig, url: string, init: RequestInit): Promise<JsonObject | JsonObject[]> {
  let response: Response
  try {
    response = await getFetcher(config)(url, init)
  } catch {
    throw new AdsProviderError('provider_error', 'Google Ads provider is unavailable')
  }
  return readJsonResponse(response)
}

function tokenExpiry(expiresIn: unknown): string | null {
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) return null
  return new Date(Date.now() + expiresIn * 1000).toISOString()
}

function tokenScopes(scope: unknown): string[] {
  return typeof scope === 'string' ? scope.split(/\s+/).filter(Boolean) : [GOOGLE_ADS_SCOPE]
}

function normalizeCustomerId(value: string): string {
  const id = value.replaceAll('-', '')
  if (!/^\d{10}$/.test(id)) throw new AdsProviderError('invalid_input', 'Google Ads customer id is invalid')
  return id
}

function customerIdFromResourceName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^customers\/(\d{10})$/.exec(value)
  return match?.[1] ?? null
}

function getSearchResults(payload: JsonObject | JsonObject[]): JsonObject[] {
  const chunks = Array.isArray(payload) ? payload : [payload]
  return chunks.flatMap((chunk) => (Array.isArray(chunk.results) ? (chunk.results as JsonObject[]) : []))
}

function accountSummary(
  externalAccountId: string,
  values: JsonObject | undefined,
  loginCustomerId: string | null,
): AdsAccountSummary {
  const name = values?.descriptiveName
  const currency = values?.currencyCode
  return {
    externalAccountId,
    name: typeof name === 'string' ? name.slice(0, 200) : null,
    currency: typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : null,
    loginCustomerId,
    isManager: values?.manager === true,
  }
}

async function searchStream(
  config: GoogleAdsProviderConfig,
  accessToken: string,
  customerId: string,
  query: string,
  loginCustomerId: string | null,
): Promise<JsonObject[]> {
  const id = normalizeCustomerId(customerId)
  const headers = new Headers({
    authorization: `Bearer ${accessToken}`,
    accept: 'application/json',
    'content-type': 'application/json',
  })
  if (loginCustomerId) headers.set('login-customer-id', normalizeCustomerId(loginCustomerId))

  const method: GoogleAdsApiMethod = 'googleAds.searchStream'
  const operation = () =>
    fetchJson(config, `${GOOGLE_ADS_API_ENDPOINT}/customers/${id}/googleAds:searchStream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    })

  const payload = config.withApiRequest ? await config.withApiRequest(method, operation) : await operation()
  return getSearchResults(payload)
}

function tokenFormHeaders(): Headers {
  return new Headers({
    accept: 'application/json',
    'content-type': 'application/x-www-form-urlencoded',
  })
}

function notImplemented(operation: string): never {
  throw new AdsProviderError('not_implemented', `Google Ads ${operation} is not enabled for this read-only connection`)
}

export function createGoogleAdsProvider(config: GoogleAdsProviderConfig): AdsProvider {
  return {
    platform: 'google_ads',
    status: 'available',
    displayName: 'Google Ads',

    buildAuthUrl({ state, redirectUri, codeChallenge }) {
      if (!config.clientId) throw new AdsProviderError('invalid_input', 'Google client id is missing')
      if (!state || !codeChallenge) throw new AdsProviderError('invalid_input', 'OAuth state and PKCE challenge are required')
      if (!/^https:\/\//.test(redirectUri) && !/^http:\/\/localhost(:\d+)?\//.test(redirectUri)) {
        throw new AdsProviderError('invalid_input', 'redirect uri must be https (or localhost)')
      }
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

    async exchangeCode({ code, redirectUri, codeVerifier }) {
      if (!code || !codeVerifier || !config.clientId || !config.clientSecret) {
        throw new AdsProviderError('invalid_input', 'Google OAuth configuration or authorization code is missing')
      }
      const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      })
      const payload = (await fetchJson(config, GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: tokenFormHeaders(),
        body,
      })) as TokenPayload
      if (Array.isArray(payload) || typeof payload.access_token !== 'string' || typeof payload.refresh_token !== 'string') {
        throw new AdsProviderError('auth_failed', 'Google did not issue an offline refresh token')
      }
      return {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        expiresAt: tokenExpiry(payload.expires_in),
        scopes: tokenScopes(payload.scope),
      } satisfies AdsTokenSet
    },

    async refreshAccessToken(refreshToken) {
      if (!refreshToken || !config.clientId || !config.clientSecret) {
        throw new AdsProviderError('invalid_input', 'Google OAuth configuration is missing')
      }
      const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      })
      const payload = (await fetchJson(config, GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: tokenFormHeaders(),
        body,
      })) as TokenPayload
      if (Array.isArray(payload) || typeof payload.access_token !== 'string') {
        throw new AdsProviderError('auth_failed', 'Google access token could not be refreshed')
      }
      return { accessToken: payload.access_token, expiresAt: tokenExpiry(payload.expires_in) }
    },

    async listAccounts(accessToken) {
      if (!accessToken) throw new AdsProviderError('invalid_input', 'Google Ads access token is missing')
      const headers = new Headers({ authorization: `Bearer ${accessToken}`, accept: 'application/json' })
      const method: GoogleAdsApiMethod = 'customers.listAccessibleCustomers'
      const listOperation = () =>
        fetchJson(config, `${GOOGLE_ADS_API_ENDPOINT}/customers:listAccessibleCustomers`, {
          method: 'GET',
          headers,
        })
      const accessiblePayload = config.withApiRequest
        ? await config.withApiRequest(method, listOperation)
        : await listOperation()

      if (Array.isArray(accessiblePayload)) {
        throw new AdsProviderError('provider_error', 'Google Ads returned an invalid accessible-customer response')
      }
      const resourceNames = Array.isArray(accessiblePayload.resourceNames)
        ? accessiblePayload.resourceNames
        : []
      const accessibleIds = [...new Set(resourceNames.map(customerIdFromResourceName).filter((id): id is string => Boolean(id)))]
      const accounts = new Map<string, AdsAccountSummary>()

      for (const customerId of accessibleIds) {
        const customerRows = await searchStream(
          config,
          accessToken,
          customerId,
          'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1',
          null,
        )
        const customer = customerRows[0]?.customer
        const customerData = customer && typeof customer === 'object' ? (customer as JsonObject) : undefined
        const manager = customerData?.manager === true
        accounts.set(customerId, accountSummary(customerId, customerData, null))

        if (!manager) continue

        const childRows = await searchStream(
          config,
          accessToken,
          customerId,
          'SELECT customer_client.client_customer, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager FROM customer_client WHERE customer_client.level <= 1',
          customerId,
        )

        for (const row of childRows) {
          const client = row.customerClient
          if (!client || typeof client !== 'object') continue
          const child = client as JsonObject
          const childId = customerIdFromResourceName(child.clientCustomer)
          if (!childId || childId === customerId) continue
          accounts.set(childId, accountSummary(childId, child, customerId))
        }
      }

      return [...accounts.values()].sort((left, right) => (left.name ?? left.externalAccountId).localeCompare(right.name ?? right.externalAccountId))
    },

    async publishCampaign() {
      return notImplemented('campaign publishing')
    },

    async setCampaignStatus() {
      return notImplemented('campaign status changes')
    },

    async revoke(refreshToken) {
      if (!refreshToken) throw new AdsProviderError('invalid_input', 'Google refresh token is missing')
      let response: Response
      try {
        response = await getFetcher(config)(GOOGLE_REVOKE_ENDPOINT, {
          method: 'POST',
          headers: tokenFormHeaders(),
          body: new URLSearchParams({ token: refreshToken }),
        })
      } catch {
        throw new AdsProviderError('provider_error', 'Google token revocation is unavailable')
      }
      if (!response.ok) throw providerErrorForStatus(response.status)
    },
  }
}
