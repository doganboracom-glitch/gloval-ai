import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { META_AUTH_DIALOG_ORIGIN, type MetaApiClient, type MetaApiContext } from '@/lib/ads/meta-api-client'
import {
  META_DATE_PRESETS,
  META_MANAGE_REQUESTED_SCOPES,
  META_REQUESTED_SCOPES,
  type MetaAdAccountCandidate,
  type MetaAdsRange,
  type MetaCampaignReport,
  type MetaInsightRow,
  type MetaInstagramAccount,
  type MetaPageCandidate,
} from '@/lib/ads/meta-ads-shared'
import {
  AdsProviderError,
  type AdsOAuthStartInput,
  type AdsProvider,
} from '@/lib/ads/providers/types'

export type MetaTokenInspection = {
  isValid: boolean
  /** App-scoped Meta user id. */
  metaUserId: string | null
  scopes: string[]
  /** null when Meta reports a non-expiring token (expires_at = 0). */
  expiresAt: string | null
}

export type MetaLongLivedToken = {
  accessToken: string
  expiresAt: string | null
}

export interface MetaAdsProvider extends AdsProvider {
  /** Phase M2: login dialog that additionally asks for the write permissions (uses the manage Configuration when set). */
  buildManageAuthUrl(input: AdsOAuthStartInput): string
  exchangeCodeForLongLivedToken(input: { code: string; redirectUri: string; context: MetaApiContext }): Promise<MetaLongLivedToken>
  inspectToken(input: { accessToken: string; context: MetaApiContext }): Promise<MetaTokenInspection>
  listAdAccounts(input: { accessToken: string; context: MetaApiContext }): Promise<MetaAdAccountCandidate[]>
  listPages(input: { accessToken: string; context: MetaApiContext }): Promise<MetaPageCandidate[]>
  listInstagramAccounts(input: { accessToken: string; accountId: string; context: MetaApiContext }): Promise<MetaInstagramAccount[]>
  getAccountStatus(input: { accessToken: string; accountId: string; context: MetaApiContext }): Promise<number | null>
  getCampaigns(input: { accessToken: string; accountId: string; context: MetaApiContext }): Promise<Omit<MetaCampaignReport, keyof MetaInsightRow>[]>
  getInsights(input: {
    accessToken: string
    accountId: string
    range: MetaAdsRange
    level: 'account' | 'campaign'
    context: MetaApiContext
  }): Promise<Array<MetaInsightRow & { campaignId: string | null }>>
  revokePermissions(input: { accessToken: string; context: MetaApiContext }): Promise<void>
}

function notImplemented(name: string): never {
  throw new AdsProviderError('not_implemented', `Meta ${name} is not available in phase M1`)
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function dataArray(payload: unknown): unknown[] {
  const data = record(payload)?.data
  return Array.isArray(data) ? data : []
}

function text(value: unknown, max = 200): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null
}

function numeric(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function optionalNumeric(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeMetaAccountId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^(?:act_)?(\d{5,25})$/.exec(value.trim())
  return match ? `act_${match[1]}` : null
}

const FB_ID = /^\d{1,30}$/

export function parseMetaInsightRow(raw: unknown): MetaInsightRow & { campaignId: string | null } {
  const row = record(raw) ?? {}
  const campaignId = typeof row.campaign_id === 'string' && FB_ID.test(row.campaign_id) ? row.campaign_id : null
  return {
    campaignId,
    impressions: numeric(row.impressions),
    clicks: numeric(row.clicks),
    spend: numeric(row.spend),
    reach: numeric(row.reach),
    ctr: optionalNumeric(row.ctr),
    cpc: optionalNumeric(row.cpc),
  }
}

export function createMetaAdsProvider(options: {
  client: MetaApiClient
  appId: string
  appSecret: string
  apiVersion: string
  loginConfigId?: string | null
  manageLoginConfigId?: string | null
}): MetaAdsProvider {
  const { client, appId, appSecret, apiVersion, loginConfigId = null, manageLoginConfigId = null } = options

  return {
    platform: 'meta',
    status: 'available',
    displayName: 'Meta (Facebook / Instagram)',

    buildAuthUrl(input: AdsOAuthStartInput): string {
      return buildMetaAuthUrl({ appId, apiVersion, redirectUri: input.redirectUri, state: input.state, loginConfigId })
    },
    buildManageAuthUrl(input: AdsOAuthStartInput): string {
      return buildMetaAuthUrl({
        appId,
        apiVersion,
        redirectUri: input.redirectUri,
        state: input.state,
        loginConfigId: manageLoginConfigId,
        scopes: META_MANAGE_REQUESTED_SCOPES,
      })
    },
    exchangeCode: async () => notImplemented('exchangeCode'),
    refreshAccessToken: async () => notImplemented('refreshAccessToken'),
    listAccounts: async () => notImplemented('listAccounts'),
    publishCampaign: async () => notImplemented('publishCampaign'),
    setCampaignStatus: async () => notImplemented('setCampaignStatus'),
    revoke: async () => notImplemented('revoke'),

    async exchangeCodeForLongLivedToken({ code, redirectUri, context }) {
      const short = record(await client.request({
        endpoint: 'oauth.token',
        path: '/oauth/access_token',
        method: 'POST',
        form: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
        context,
      }))
      const shortToken = text(short?.access_token, 2048)
      if (!shortToken) throw new MetaAdsError('oauth_failed')

      const long = record(await client.request({
        endpoint: 'oauth.token',
        path: '/oauth/access_token',
        method: 'POST',
        form: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortToken,
        },
        context,
      }))
      const longToken = text(long?.access_token, 2048)
      if (!longToken) throw new MetaAdsError('oauth_failed')
      const expiresIn = optionalNumeric(long?.expires_in)
      return {
        accessToken: longToken,
        expiresAt: expiresIn && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      }
    },

    async inspectToken({ accessToken, context }) {
      const payload = record(await client.request({
        endpoint: 'debug_token',
        path: '/debug_token',
        accessToken: `${appId}|${appSecret}`,
        query: { input_token: accessToken },
        context,
      }))
      const data = record(payload?.data)
      if (!data) throw new MetaAdsError('oauth_failed')
      const granular = Array.isArray(data.scopes) ? data.scopes.filter((s): s is string => typeof s === 'string') : []
      const expiresAt = optionalNumeric(data.expires_at)
      const metaUserId = typeof data.user_id === 'string' && FB_ID.test(data.user_id) ? data.user_id : null
      return {
        isValid: data.is_valid === true && data.app_id === appId,
        metaUserId,
        scopes: granular.filter((scope) => /^[a-z_]{1,64}$/.test(scope)),
        expiresAt: expiresAt && expiresAt > 0 ? new Date(expiresAt * 1000).toISOString() : null,
      }
    },

    async listAdAccounts({ accessToken, context }) {
      const payload = await client.request({
        endpoint: 'me.adaccounts',
        path: '/me/adaccounts',
        accessToken,
        query: { fields: 'id,account_id,name,currency,account_status,timezone_name,business', limit: '100' },
        context,
      })
      const accounts: MetaAdAccountCandidate[] = []
      for (const item of dataArray(payload)) {
        const row = record(item)
        const id = normalizeMetaAccountId(row?.id ?? (row?.account_id ? `act_${String(row.account_id)}` : null))
        if (!row || !id) continue
        const business = record(row.business)
        const currency = typeof row.currency === 'string' && /^[A-Z]{3}$/.test(row.currency) ? row.currency : null
        accounts.push({
          externalAccountId: id,
          name: text(row.name),
          currency,
          accountStatus: optionalNumeric(row.account_status),
          businessId: typeof business?.id === 'string' && FB_ID.test(business.id) ? business.id : null,
        })
      }
      return accounts
    },

    async listPages({ accessToken, context }) {
      const payload = await client.request({
        endpoint: 'me.accounts',
        path: '/me/accounts',
        accessToken,
        query: { fields: 'id,name', limit: '100' },
        context,
      })
      const pages: MetaPageCandidate[] = []
      for (const item of dataArray(payload)) {
        const row = record(item)
        if (!row || typeof row.id !== 'string' || !FB_ID.test(row.id)) continue
        pages.push({ pageId: row.id, pageName: text(row.name) })
      }
      return pages
    },

    /** Best effort: any failure (missing access, Meta error) yields an empty list instead of an error. */
    async listInstagramAccounts({ accessToken, accountId, context }) {
      const id = normalizeMetaAccountId(accountId)
      if (!id) return []
      try {
        const payload = await client.request({
          endpoint: 'act.instagram_accounts',
          path: `/${id}/instagram_accounts`,
          accessToken,
          query: { fields: 'id,username', limit: '25' },
          context,
        })
        const accounts: MetaInstagramAccount[] = []
        for (const item of dataArray(payload)) {
          const row = record(item)
          if (!row || typeof row.id !== 'string' || !FB_ID.test(row.id)) continue
          accounts.push({ id: row.id, username: text(row.username) })
        }
        return accounts
      } catch {
        return []
      }
    },

    async getAccountStatus({ accessToken, accountId, context }) {
      const id = normalizeMetaAccountId(accountId)
      if (!id) throw new MetaAdsError('invalid_request')
      const payload = record(await client.request({
        endpoint: 'act.account',
        path: `/${id}`,
        accessToken,
        query: { fields: 'account_status' },
        context,
      }))
      return optionalNumeric(payload?.account_status)
    },

    async getCampaigns({ accessToken, accountId, context }) {
      const id = normalizeMetaAccountId(accountId)
      if (!id) throw new MetaAdsError('invalid_request')
      const payload = await client.request({
        endpoint: 'act.campaigns',
        path: `/${id}/campaigns`,
        accessToken,
        query: { fields: 'id,name,status,effective_status,daily_budget,lifetime_budget', limit: '100' },
        context,
      })
      const campaigns: Omit<MetaCampaignReport, keyof MetaInsightRow>[] = []
      for (const item of dataArray(payload)) {
        const row = record(item)
        if (!row || typeof row.id !== 'string' || !FB_ID.test(row.id)) continue
        campaigns.push({
          id: row.id,
          name: text(row.name, 300) ?? row.id,
          status: text(row.status, 40),
          effectiveStatus: text(row.effective_status, 40),
          dailyBudgetMinor: optionalNumeric(row.daily_budget),
          lifetimeBudgetMinor: optionalNumeric(row.lifetime_budget),
        })
      }
      return campaigns
    },

    async getInsights({ accessToken, accountId, range, level, context }) {
      const id = normalizeMetaAccountId(accountId)
      if (!id) throw new MetaAdsError('invalid_request')
      const fields = level === 'campaign'
        ? 'campaign_id,impressions,clicks,spend,reach,ctr,cpc'
        : 'impressions,clicks,spend,reach,ctr,cpc'
      const payload = await client.request({
        endpoint: 'act.insights',
        path: `/${id}/insights`,
        accessToken,
        query: { fields, level, date_preset: META_DATE_PRESETS[range], limit: '100' },
        context,
      })
      return dataArray(payload).map(parseMetaInsightRow)
    },

    async revokePermissions({ accessToken, context }) {
      await client.request({
        endpoint: 'me.permissions',
        path: '/me/permissions',
        method: 'DELETE',
        accessToken,
        context,
      })
    },
  }
}

export function buildMetaAuthUrl(input: {
  appId: string
  apiVersion: string
  redirectUri: string
  state: string
  /** Facebook Login for Business Configuration id; replaces `scope` when set. */
  loginConfigId?: string | null
  /** Scope-mode override (used by the "grant publishing" login). */
  scopes?: readonly string[]
}): string {
  const url = new URL(`${META_AUTH_DIALOG_ORIGIN}/${input.apiVersion}/dialog/oauth`)
  url.searchParams.set('client_id', input.appId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('state', input.state)
  url.searchParams.set('response_type', 'code')
  if (input.loginConfigId) {
    url.searchParams.set('config_id', input.loginConfigId)
    // Login for Business defaults to a token response; the server-side flow needs an authorization code.
    url.searchParams.set('override_default_response_type', 'true')
  } else {
    url.searchParams.set('scope', (input.scopes ?? META_REQUESTED_SCOPES).join(','))
  }
  return url.toString()
}
