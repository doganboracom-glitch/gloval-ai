import { createGoogleAdsApiTransport } from '@/lib/ads/google-api-client'
import { googleAdsConnectAllowed, googleAdsErrorResponse, googleAdsFeatureEnabled, googleAdsJson, googleAdsUserId } from '@/lib/ads/google-route-utils'
import { createGoogleAdsProvider } from '@/lib/ads/providers/google-ads-provider'
import { withGoogleAdsAccess } from '@/lib/ads/google-connections'
import { resolveGoogleAdsOAuthSettings } from '@/lib/ads/env'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import type { GoogleAdsDateRange } from '@/lib/ads/providers/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  if (!googleAdsFeatureEnabled()) return googleAdsJson({ error: 'not_found' }, 404)
  const userId = await googleAdsUserId()
  if (!userId) return googleAdsJson({ error: 'not_authenticated' }, 401)
  if (!googleAdsConnectAllowed(userId)) return googleAdsJson({ error: 'not_found' }, 404)

  const url = new URL(request.url)
  const connectionId = url.searchParams.get('connectionId') ?? ''
  const rangeValue = url.searchParams.get('range') ?? '7d'
  if (!UUID_PATTERN.test(connectionId) || (rangeValue !== '7d' && rangeValue !== '30d')) {
    return googleAdsJson({ error: 'invalid_request' }, 400)
  }
  const range = rangeValue as GoogleAdsDateRange

  const resolved = resolveGoogleAdsOAuthSettings()
  if (!resolved.ok) return googleAdsJson({ error: resolved.reason }, 503)

  try {
    const authProvider = createGoogleAdsProvider({
      clientId: resolved.settings.clientId,
      clientSecret: resolved.settings.clientSecret,
      redirectUri: resolved.settings.redirectUri,
    })
    const report = await withGoogleAdsAccess({
      userId,
      connectionId,
      provider: authProvider,
      action: async ({ connection, accessToken, context }) => {
        const apiTransport = createGoogleAdsApiTransport({
          userId,
          connectionId: connection.id,
        })
        const reportingProvider = createGoogleAdsProvider({
          clientId: resolved.settings.clientId,
          clientSecret: resolved.settings.clientSecret,
          redirectUri: resolved.settings.redirectUri,
          requestAdsApi: apiTransport,
        })
        return reportingProvider.getPerformance({
          accessToken,
          customerId: connection.external_account_id,
          loginCustomerId: connection.login_customer_id,
          range,
          currency: connection.currency_code,
          context,
        })
      },
    })

    return googleAdsJson({ ok: true, report, refreshedAt: new Date().toISOString() })
  } catch (error) {
    return googleAdsErrorResponse(error instanceof GoogleAdsError ? error : new GoogleAdsError('provider_error'))
  }
}
