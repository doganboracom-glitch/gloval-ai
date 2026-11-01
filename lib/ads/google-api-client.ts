import 'server-only'

import { randomUUID } from 'node:crypto'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import type { GoogleAdsApiCall, GoogleAdsApiMethod, GoogleAdsApiTransport } from '@/lib/ads/providers/google-ads-provider'
import { GOOGLE_ADS_API_VERSION } from '@/lib/ads/providers/google-ads-provider'
import { createAdminClient } from '@/lib/supabase/admin'

const API_BASE = 'https://googleads.googleapis.com'
const SAFE_OUTCOMES = {
  rate_limited: 'rate_limited',
  provider_unavailable: 'provider_unavailable',
  provider_rejected: 'provider_rejected',
  network_error: 'network_error',
} as const

function allowedPath(method: GoogleAdsApiMethod, path: string): boolean {
  if (method === 'customers.listAccessibleCustomers') return path === 'customers:listAccessibleCustomers'
  if (method === 'googleAds.search' || method === 'googleAds.searchStream') {
    return /^customers\/\d{6,20}\/googleAds:(?:search|searchStream)$/.test(path)
  }
  if (method === 'googleAds.mutate') return /^customers\/\d{6,20}\/googleAds:mutate$/.test(path)
  return false
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

const MUTATE_OPERATION_TYPES = [
  'campaignBudgetOperation',
  'campaignOperation',
  'adGroupOperation',
  'campaignCriterionOperation',
  'adGroupCriterionOperation',
  'adGroupAdOperation',
] as const

function mutateOperationCount(body: unknown): number | null {
  const request = record(body)
  if (!request || request.partialFailure !== false || typeof request.validateOnly !== 'boolean') return null
  if (!Array.isArray(request.mutateOperations) || request.mutateOperations.length < 1 || request.mutateOperations.length > 100) {
    return null
  }
  for (const operation of request.mutateOperations) {
    const value = record(operation)
    if (!value) return null
    const kinds = MUTATE_OPERATION_TYPES.filter((kind) => Object.hasOwn(value, kind))
    if (kinds.length !== 1 || !record(value[kinds[0]])) return null
  }
  return request.mutateOperations.length
}

function responseError(payload: unknown): { status: string; message: string; dailyQuota: boolean; temporary: boolean } {
  if (!payload || typeof payload !== 'object') return { status: '', message: '', dailyQuota: false, temporary: false }
  const error = (payload as { error?: unknown }).error
  if (!error || typeof error !== 'object') return { status: '', message: '', dailyQuota: false, temporary: false }
  const record = error as { status?: unknown; message?: unknown; details?: unknown }
  const status = typeof record.status === 'string' ? record.status : ''
  const message = typeof record.message === 'string' ? record.message : ''
  const details = JSON.stringify(record.details ?? '')
  const combined = `${status} ${message} ${details}`.toUpperCase()
  return {
    status,
    message,
    dailyQuota: /RESOURCE_EXHAUSTED|DAILY.*QUOTA|QUOTA.*EXCEEDED/.test(combined),
    temporary: /RESOURCE_TEMPORARILY_EXHAUSTED|TEMPORARY.*EXHAUSTED/.test(combined),
  }
}

function retryDelay(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(3000, seconds * 1000)
  return Math.min(2500, attempt * 500 + Math.floor(Math.random() * 250))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function recordOutcome(
  admin: ReturnType<typeof createAdminClient>,
  requestId: string,
  outcome: 'success' | 'error',
  safeErrorCode: keyof typeof SAFE_OUTCOMES | null,
) {
  const { error } = await admin
    .from('ads_google_api_operations')
    .update({ outcome, safe_error_code: safeErrorCode ? SAFE_OUTCOMES[safeErrorCode] : null })
    .eq('request_id', requestId)
  if (error) console.error('[google-ads] operation result update failed', { requestId })
}

export function createGoogleAdsApiTransport(input: {
  userId: string
  connectionId: string | null
  apiVersion?: string
  fetcher?: typeof fetch
}): GoogleAdsApiTransport {
  const admin = createAdminClient()
  const fetcher = input.fetcher ?? fetch
  const apiVersion = input.apiVersion ?? GOOGLE_ADS_API_VERSION

  return async (call: GoogleAdsApiCall) => {
    if (
      call.context.userId !== input.userId ||
      call.context.connectionId !== input.connectionId ||
      !allowedPath(call.method, call.path) ||
      (call.loginCustomerId !== null && !/^\d{6,20}$/.test(call.loginCustomerId))
    ) {
      throw new GoogleAdsError('invalid_request')
    }

    const isMutation = call.method === 'googleAds.mutate'
    const operationCount = isMutation ? mutateOperationCount(call.body) : 1
    if (isMutation && operationCount === null) throw new GoogleAdsError('invalid_request')
    const maxAttempts = isMutation ? 1 : 3

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const requestId = randomUUID()
      const reserveArgs: Record<string, unknown> = {
        p_request_id: requestId,
        p_user_id: input.userId,
        p_connection_id: input.connectionId,
        p_method: call.method,
      }
      if (isMutation) reserveArgs.p_operation_count = operationCount
      const { data, error } = await admin.rpc(
        isMutation ? 'ads_reserve_google_api_operation_v2' : 'ads_reserve_google_api_operation',
        reserveArgs,
      )

      const reservation = Array.isArray(data) ? data[0] : data
      if (error || !reservation || typeof reservation.allowed !== 'boolean') {
        throw new GoogleAdsError('quota_check_failed')
      }
      if (!reservation.allowed) throw new GoogleAdsError('api_quota_exceeded')

      const httpMethod = call.method === 'customers.listAccessibleCustomers' ? 'GET' : 'POST'
      const headers = new Headers({ Authorization: `Bearer ${call.accessToken}` })
      if (call.loginCustomerId) headers.set('login-customer-id', call.loginCustomerId)
      if (httpMethod === 'POST' && call.body) headers.set('Content-Type', 'application/json')

      let response: Response
      let payload: unknown
      try {
        response = await fetcher(`${API_BASE}/${apiVersion}/${call.path}`, {
          method: httpMethod,
          headers,
          ...(httpMethod === 'POST' && call.body ? { body: JSON.stringify(call.body) } : {}),
          signal: AbortSignal.timeout(15_000),
        })
        payload = await response.json().catch(() => null)
      } catch {
        await recordOutcome(admin, requestId, 'error', 'network_error')
        if (attempt < maxAttempts) {
          await delay(retryDelay(attempt, null))
          continue
        }
        throw new GoogleAdsError('provider_unavailable')
      }

      if (response.ok) {
        await recordOutcome(admin, requestId, 'success', null)
        return payload
      }

      const providerError = responseError(payload)
      if (providerError.dailyQuota) {
        await recordOutcome(admin, requestId, 'error', 'rate_limited')
        throw new GoogleAdsError('api_quota_exceeded')
      }

      const shouldRetry = !isMutation && (response.status === 429 || response.status >= 500) &&
        (providerError.temporary || response.status >= 500 || response.status === 429)
      await recordOutcome(
        admin,
        requestId,
        'error',
        response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'provider_unavailable' : 'provider_rejected',
      )

      if (shouldRetry && attempt < 3) {
        await delay(retryDelay(attempt, response.headers.get('retry-after')))
        continue
      }
      if (response.status === 401 || response.status === 403) throw new GoogleAdsError('not_authorized')
      if (response.status === 429) throw new GoogleAdsError('rate_limited')
      if (response.status >= 500) throw new GoogleAdsError('provider_unavailable')
      throw new GoogleAdsError('provider_error')
    }

    throw new GoogleAdsError('provider_unavailable')
  }
}
