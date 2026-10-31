import { randomUUID } from 'node:crypto'
import { AdsProviderError } from '@/lib/ads/providers/types'
import type { Admin } from '@/lib/external-cleanup'

export type GoogleAdsApiMethod =
  | 'customers.listAccessibleCustomers'
  | 'googleAds.search'
  | 'googleAds.searchStream'

export type GoogleAdsApiRequestWrapper = <T>(
  method: GoogleAdsApiMethod,
  operation: () => Promise<T>,
) => Promise<T>

type Reservation = { allowed?: unknown }
type SafeErrorCode = 'rate_limited' | 'provider_unavailable' | 'provider_rejected' | 'network_error'

function safeErrorCode(error: unknown): SafeErrorCode {
  if (error instanceof AdsProviderError && error.code === 'rate_limited') return 'rate_limited'
  if (error instanceof TypeError) return 'network_error'
  return 'provider_rejected'
}

export function createGoogleAdsApiRequestWrapper(
  admin: Admin,
  userId: string,
  connectionId: string | null,
): GoogleAdsApiRequestWrapper {
  return async <T>(method: GoogleAdsApiMethod, operation: () => Promise<T>): Promise<T> => {
    const requestId = randomUUID()
    const { data, error } = await admin.rpc('ads_reserve_google_api_operation', {
      p_request_id: requestId,
      p_user_id: userId,
      p_connection_id: connectionId,
      p_method: method,
    })

    if (error) throw new AdsProviderError('provider_error', 'Google Ads request could not be reserved')

    const reservation = (Array.isArray(data) ? data[0] : data) as Reservation | null
    if (!reservation || reservation.allowed !== true) {
      throw new AdsProviderError('rate_limited', 'Google Ads request limit reached')
    }

    try {
      const result = await operation()
      await finishGoogleAdsOperation(admin, requestId, 'success', null)
      return result
    } catch (operationError) {
      await finishGoogleAdsOperation(admin, requestId, 'error', safeErrorCode(operationError))
      throw operationError
    }
  }
}

async function finishGoogleAdsOperation(
  admin: Admin,
  requestId: string,
  outcome: 'success' | 'error',
  errorCode: SafeErrorCode | null,
): Promise<void> {
  const { error } = await admin
    .from('ads_google_api_operations')
    .update({ outcome, safe_error_code: errorCode })
    .eq('request_id', requestId)

  if (error) {
    console.warn('[google-ads] API operation outcome could not be recorded', { outcome })
  }
}
