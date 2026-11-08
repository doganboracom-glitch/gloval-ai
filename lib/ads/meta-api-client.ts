import 'server-only'

import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveMetaGraphApiVersion, resolveMetaReadDailyLimits, resolveMetaWriteDailyLimits } from '@/lib/ads/env'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import {
  classifyMetaError,
  extractMetaErrorDetail,
  formatMetaErrorCode,
  type MetaErrorDetail,
} from '@/lib/ads/meta-error-detail'

/** Allow-list that mirrors the `endpoint` check constraint of `ads_meta_api_operations`. */
export const META_API_ENDPOINTS = [
  'me.adaccounts',
  'me.accounts',
  'me.permissions',
  'act.account',
  'act.instagram_accounts',
  'act.insights',
  'act.campaigns',
  'debug_token',
  'oauth.token',
  // Phase M2 reads (idempotent re-find by gloval-req label, payment method check)
  'act.adsets',
  'act.adcreatives',
  'act.ads',
  'act.adimages',
  'act.funding',
  'act.minimum_budgets',
  // Phase M2 writes. `.validate` = execution_options validate_only. Counted in a separate write quota.
  'act.campaigns.create',
  'act.adsets.create',
  'act.adimages.create',
  'act.adcreatives.create',
  'act.ads.create',
  'act.campaigns.validate',
  'act.adsets.validate',
  'act.adcreatives.validate',
  'act.ads.validate',
  // Phase M3 reads (live status of the three objects, spend) and writes (status / budget updates).
  'act.insights.campaign',
  'campaign.status',
  'adset.status',
  'ad.status',
  'act.campaigns.update',
  'act.adsets.update',
  'act.ads.update',
] as const
export type MetaApiEndpoint = (typeof META_API_ENDPOINTS)[number]

/** Write endpoints are never retried and are counted against the write quota instead of the read quota. */
export function isMetaWriteEndpoint(endpoint: MetaApiEndpoint): boolean {
  return endpoint.endsWith('.create') || endpoint.endsWith('.validate') || endpoint.endsWith('.update')
}

export type MetaSafeErrorCode =
  | 'outcome_unknown'
  | 'reauth_required'
  | 'permission_missing'
  | 'rate_limited'
  | 'provider_error'
  | 'network_error'

export type MetaApiContext = {
  userId: string
  connectionId: string | null
}

export type MetaQuotaReservation = {
  requestId: string
  context: MetaApiContext
  endpoint: MetaApiEndpoint
  userDailyLimit: number
  globalDailyLimit: number
}

export type MetaApiClientDeps = {
  fetchImpl?: typeof fetch
  /** Returns false when the daily quota is exhausted; throws when the check itself fails. */
  reserveQuota?: (input: MetaQuotaReservation) => Promise<boolean>
  recordOutcome?: (requestId: string, outcome: 'success' | 'error', safeErrorCode: MetaSafeErrorCode | null) => Promise<void>
  sleep?: (ms: number) => Promise<void>
  log?: (message: string) => void
  timeoutMs?: number
  maxRetries?: number
  apiVersion?: string
}

export type MetaApiRequest = {
  endpoint: MetaApiEndpoint
  /** Path below the versioned root, e.g. `/me/adaccounts`. */
  path: string
  method?: 'GET' | 'POST' | 'DELETE'
  /** Sent as `Authorization: Bearer`; never placed in the URL. */
  accessToken?: string
  query?: Record<string, string>
  /** Form body for POST (OAuth code exchange keeps the app secret out of the URL). */
  form?: Record<string, string>
  context: MetaApiContext
}

const GRAPH_ORIGIN = 'https://graph.facebook.com'
const DEFAULT_TIMEOUT_MS = 10_000
const WRITE_TIMEOUT_FLOOR_MS = 25_000
const DEFAULT_MAX_RETRIES = 2
const PATH_PATTERN = /^\/[A-Za-z0-9_./-]{1,200}$/

export const META_AUTH_DIALOG_ORIGIN = 'https://www.facebook.com'

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function defaultReserveQuota(input: MetaQuotaReservation): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('ads_reserve_meta_api_operation', {
    p_request_id: input.requestId,
    p_user_id: input.context.userId,
    p_connection_id: input.context.connectionId,
    p_endpoint: input.endpoint,
    p_user_daily_limit: input.userDailyLimit,
    p_global_daily_limit: input.globalDailyLimit,
  })
  if (error) throw new MetaAdsError('quota_check_failed')
  const row = Array.isArray(data) ? data[0] : data
  return Boolean(row && typeof row === 'object' && (row as { allowed?: unknown }).allowed === true)
}

async function defaultRecordOutcome(
  requestId: string,
  outcome: 'success' | 'error',
  safeErrorCode: MetaSafeErrorCode | null,
): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('ads_meta_api_operations')
    .update({ outcome, safe_error_code: safeErrorCode })
    .eq('request_id', requestId)
}

function toMetaErrorCode(klass: ReturnType<typeof classifyMetaError>) {
  return klass
}

function safeCodeFor(klass: ReturnType<typeof classifyMetaError>): MetaSafeErrorCode {
  return klass === 'provider_unavailable' ? 'provider_error' : klass
}

export type MetaApiClient = {
  request(input: MetaApiRequest): Promise<unknown>
}

/**
 * The single place that talks to graph.facebook.com.
 * Per logical call: reserve quota -> versioned request with a timeout -> bounded retries (GET only, transient
 * failures only) -> record a safe outcome. Raw response bodies, tokens and URLs are never logged or stored.
 */
export function createMetaApiClient(deps: MetaApiClientDeps = {}): MetaApiClient {
  const fetchImpl = deps.fetchImpl ?? fetch
  const reserveQuota = deps.reserveQuota ?? defaultReserveQuota
  const recordOutcome = deps.recordOutcome ?? defaultRecordOutcome
  const sleep = deps.sleep ?? defaultSleep
  const log = deps.log ?? ((message: string) => console.error(message))
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES

  async function settle(requestId: string, outcome: 'success' | 'error', code: MetaSafeErrorCode | null) {
    try {
      await recordOutcome(requestId, outcome, code)
    } catch {
      log('[meta-ads] outcome record failed')
    }
  }

  return {
    async request(input) {
      if (!META_API_ENDPOINTS.includes(input.endpoint) || !PATH_PATTERN.test(input.path) || input.path.includes('..') || input.path.includes('//')) {
        throw new MetaAdsError('invalid_request')
      }
      const method = input.method ?? 'GET'
      const apiVersion = deps.apiVersion ?? resolveMetaGraphApiVersion()
      const isWrite = isMetaWriteEndpoint(input.endpoint)
      if (isWrite && method !== 'POST') throw new MetaAdsError('invalid_request')
      const limits = isWrite ? resolveMetaWriteDailyLimits() : resolveMetaReadDailyLimits()
      const requestId = randomUUID()

      const allowed = await reserveQuota({
        requestId,
        context: input.context,
        endpoint: input.endpoint,
        userDailyLimit: limits.perUser,
        globalDailyLimit: limits.global,
      })
      if (!allowed) throw new MetaAdsError('api_quota_exceeded')

      const url = new URL(`${GRAPH_ORIGIN}/${apiVersion}${input.path}`)
      for (const [key, value] of Object.entries(input.query ?? {})) url.searchParams.set(key, value)

      const headers: Record<string, string> = { Accept: 'application/json' }
      if (input.accessToken) headers.Authorization = `Bearer ${input.accessToken}`
      let body: string | undefined
      if (input.form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        body = new URLSearchParams(input.form).toString()
      }

      const attempts = method === 'GET' ? maxRetries + 1 : 1
      let lastError: MetaAdsError = new MetaAdsError('provider_unavailable')
      let lastSafeCode: MetaSafeErrorCode = 'network_error'

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (attempt > 0) await sleep(250 * 2 ** (attempt - 1))
        let response: Response
        try {
          response = await fetchImpl(url, {
            method,
            headers,
            body,
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(isWrite ? Math.max(timeoutMs, WRITE_TIMEOUT_FLOOR_MS) : timeoutMs),
          })
        } catch {
          // A timed-out or dropped write may still have been applied by Meta: callers must look the object up by label.
          if (isWrite && !input.endpoint.endsWith('.validate')) {
            lastError = new MetaAdsError('write_outcome_unknown')
            lastSafeCode = 'outcome_unknown'
            break
          }
          lastError = new MetaAdsError('provider_unavailable')
          lastSafeCode = 'network_error'
          continue
        }

        let payload: unknown = null
        try {
          payload = await response.json()
        } catch {
          payload = null
        }

        if (response.ok) {
          await settle(requestId, 'success', null)
          return payload
        }

        const detail: MetaErrorDetail | null = extractMetaErrorDetail(payload)
        const klass = classifyMetaError(response.status, detail)
        if (isWrite && klass === 'provider_unavailable' && !input.endpoint.endsWith('.validate')) {
          lastError = new MetaAdsError('write_outcome_unknown', detail)
          lastSafeCode = 'outcome_unknown'
          break
        }
        lastError = new MetaAdsError(toMetaErrorCode(klass), detail)
        lastSafeCode = safeCodeFor(klass)
        if (klass !== 'provider_unavailable') break
      }

      log(`[meta-ads] graph request failed endpoint=${input.endpoint} code=${formatMetaErrorCode(lastError.detail)}`)
      await settle(requestId, 'error', lastSafeCode)
      throw lastError
    },
  }
}
