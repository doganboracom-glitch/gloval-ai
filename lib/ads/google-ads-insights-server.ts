import 'server-only'

import { createGoogleAdsApiTransport } from '@/lib/ads/google-api-client'
import { getGoogleAdsReportCache, getLatestGoogleAdsReportRefresh, createGoogleAdsReportCacheKey, setGoogleAdsReportCache, GOOGLE_ADS_REPORT_CACHE_TTL_MS, GOOGLE_ADS_REPORT_REFRESH_COOLDOWN_MS } from '@/lib/ads/google-ads-report-store'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import { withGoogleAdsAccess } from '@/lib/ads/google-connections'
import { resolveGoogleAdsOAuthSettings } from '@/lib/ads/env'
import { createGoogleAdsProvider } from '@/lib/ads/providers/google-ads-provider'
import { buildGoogleAdsInsightsReport, isGoogleAdsInsightsReport, shouldRefreshGoogleAdsReport, type GoogleAdsDatePeriod, type GoogleAdsInsightsReport, type RawGoogleAdsRow } from '@/lib/ads/google-ads-insights-shared'

const SEGMENT_QUERY_LIMIT = 15_000
const CAMPAIGN_QUERY_LIMIT = 12_000
const TERM_QUERY_LIMIT = 40
const MAX_STALE_REPORT_MS = 7 * 24 * 60 * 60 * 1000

type LoadGoogleAdsInsightsInput = {
  userId: string
  connectionId: string
  range: GoogleAdsDatePeriod
  forceRefresh?: boolean
  bypassRefreshCooldown?: boolean
}

export type LoadedGoogleAdsInsights = {
  report: GoogleAdsInsightsReport
  refreshedAt: string
  cacheHit: boolean
  stale: boolean
  refreshLimited: boolean
  retryAfterSeconds: number
}

function searchRows(value: unknown): RawGoogleAdsRow[] {
  const batches = Array.isArray(value) ? value : [value]
  return batches.flatMap((batch) => {
    if (!batch || typeof batch !== 'object' || Array.isArray(batch)) return []
    const results = (batch as { results?: unknown }).results
    return Array.isArray(results)
      ? results.filter((row): row is RawGoogleAdsRow => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
      : []
  })
}

function buildQueries(range: GoogleAdsDatePeriod): {
  segments: string
  campaigns: string
  keywords: string
  searchTerms: string
} {
  const fullFrom = range.previousFrom
  const fullTo = range.to
  return {
    segments: `SELECT segments.date, segments.device, segments.hour, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM customer WHERE segments.date BETWEEN '${fullFrom}' AND '${fullTo}' ORDER BY segments.date ASC LIMIT ${SEGMENT_QUERY_LIMIT}`,
    campaigns: `SELECT segments.date, campaign.id, campaign.name, campaign.status, campaign_budget.id, campaign_budget.amount_micros, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${fullFrom}' AND '${fullTo}' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT ${CAMPAIGN_QUERY_LIMIT}`,
    keywords: `SELECT campaign.id, campaign.name, ad_group_criterion.keyword.text, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE segments.date BETWEEN '${range.from}' AND '${range.to}' AND ad_group_criterion.status = 'ENABLED' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT ${TERM_QUERY_LIMIT}`,
    searchTerms: `SELECT campaign.id, campaign.name, search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date BETWEEN '${range.from}' AND '${range.to}' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT ${TERM_QUERY_LIMIT}`,
  }
}

async function fetchGoogleAdsInsights(input: LoadGoogleAdsInsightsInput): Promise<GoogleAdsInsightsReport> {
  const resolved = resolveGoogleAdsOAuthSettings()
  if (!resolved.ok) throw new GoogleAdsError(resolved.reason === 'redirect_uri_invalid' ? 'configuration_missing' : resolved.reason)

  const authProvider = createGoogleAdsProvider({
    clientId: resolved.settings.clientId,
    clientSecret: resolved.settings.clientSecret,
    redirectUri: resolved.settings.redirectUri,
  })

  return withGoogleAdsAccess({
    userId: input.userId,
    connectionId: input.connectionId,
    provider: authProvider,
    action: async ({ connection, accessToken, context }) => {
      const apiTransport = createGoogleAdsApiTransport({ userId: input.userId, connectionId: connection.id })
      const customerId = connection.external_account_id.replace(/-/g, '')
      if (!/^\d{6,20}$/.test(customerId)) throw new GoogleAdsError('connection_not_found')

      const execute = (query: string) => apiTransport({
        method: 'googleAds.searchStream',
        path: `customers/${customerId}/googleAds:searchStream`,
        accessToken,
        loginCustomerId: connection.login_customer_id,
        body: { query },
        context,
      }).then(searchRows)

      const queries = buildQueries(input.range)
      const [segmentRows, campaignRows, keywordRows, searchTermRows] = await Promise.all([
        execute(queries.segments),
        execute(queries.campaigns),
        execute(queries.keywords),
        execute(queries.searchTerms),
      ])

      return buildGoogleAdsInsightsReport({
        range: input.range,
        currency: connection.currency_code,
        segmentRows,
        campaignRows,
        keywordRows,
        searchTermRows,
        refreshedAt: new Date().toISOString(),
        segmentLimit: SEGMENT_QUERY_LIMIT,
        campaignLimit: CAMPAIGN_QUERY_LIMIT,
      })
    },
  })
}

function isCacheableGoogleAdsError(error: unknown): boolean {
  return error instanceof GoogleAdsError && ['api_quota_exceeded', 'rate_limited', 'provider_unavailable', 'network_error'].includes(error.code)
}

export async function loadGoogleAdsInsights(input: LoadGoogleAdsInsightsInput): Promise<LoadedGoogleAdsInsights> {
  const cacheKey = createGoogleAdsReportCacheKey('report', {
    from: input.range.from,
    to: input.range.to,
    previousFrom: input.range.previousFrom,
    previousTo: input.range.previousTo,
    version: 1,
  })
  const cached = await getGoogleAdsReportCache<unknown>({
    userId: input.userId,
    connectionId: input.connectionId,
    key: cacheKey,
  }, true)
  const now = Date.now()
  const age = cached ? Math.max(0, now - Date.parse(cached.refreshedAt)) : Number.POSITIVE_INFINITY
  const validCached = Boolean(cached && isGoogleAdsInsightsReport(cached.payload) && age < MAX_STALE_REPORT_MS)
  const decision = shouldRefreshGoogleAdsReport({
    force: input.forceRefresh === true,
    refreshedAt: validCached ? cached?.refreshedAt ?? null : null,
    now,
    cacheTtlMs: GOOGLE_ADS_REPORT_CACHE_TTL_MS,
    forceCooldownMs: GOOGLE_ADS_REPORT_REFRESH_COOLDOWN_MS,
  })

  if (validCached && cached && !decision.shouldRefresh) {
    return {
      report: cached.payload as GoogleAdsInsightsReport,
      refreshedAt: cached.refreshedAt,
      cacheHit: true,
      stale: age >= GOOGLE_ADS_REPORT_CACHE_TTL_MS,
      refreshLimited: decision.limited,
      retryAfterSeconds: decision.retryAfterSeconds,
    }
  }

  if (!input.bypassRefreshCooldown) {
    const latestRefresh = await getLatestGoogleAdsReportRefresh(input.userId, input.connectionId)
    const latestAge = latestRefresh ? Math.max(0, now - Date.parse(latestRefresh)) : Number.POSITIVE_INFINITY
    if (latestRefresh && Number.isFinite(latestAge) && latestAge < GOOGLE_ADS_REPORT_REFRESH_COOLDOWN_MS) {
      if (validCached && cached) {
        return {
          report: cached.payload as GoogleAdsInsightsReport,
          refreshedAt: cached.refreshedAt,
          cacheHit: true,
          stale: age >= GOOGLE_ADS_REPORT_CACHE_TTL_MS,
          refreshLimited: true,
          retryAfterSeconds: Math.ceil((GOOGLE_ADS_REPORT_REFRESH_COOLDOWN_MS - latestAge) / 1000),
        }
      }
      throw new GoogleAdsError('rate_limited')
    }
  }

  try {
    const report = await fetchGoogleAdsInsights(input)
    const refreshedAt = new Date().toISOString()
    const updatedReport = { ...report, refreshedAt } as GoogleAdsInsightsReport & { refreshedAt: string }
    await setGoogleAdsReportCache({
      userId: input.userId,
      connectionId: input.connectionId,
      key: cacheKey,
      payload: updatedReport,
      ttlMs: GOOGLE_ADS_REPORT_CACHE_TTL_MS,
    })
    return {
      report: updatedReport,
      refreshedAt,
      cacheHit: false,
      stale: false,
      refreshLimited: false,
      retryAfterSeconds: 0,
    }
  } catch (error) {
    if (cached && isGoogleAdsInsightsReport(cached.payload) && age < MAX_STALE_REPORT_MS && isCacheableGoogleAdsError(error)) {
      return {
        report: cached.payload,
        refreshedAt: cached.refreshedAt,
        cacheHit: true,
        stale: true,
        refreshLimited: false,
        retryAfterSeconds: 0,
      }
    }
    throw error
  }
}
