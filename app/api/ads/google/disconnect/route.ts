import { checkRateLimit } from '@/lib/rate-limit'
import { disconnectGoogleAdsConnection } from '@/lib/ads/google-connections'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import { googleAdsErrorResponse, googleAdsFeatureEnabled, googleAdsJson, googleAdsUserId, isSameOriginGoogleAdsPost } from '@/lib/ads/google-route-utils'

export const dynamic = 'force-dynamic'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  if (!googleAdsFeatureEnabled()) return googleAdsJson({ error: 'not_found' }, 404)
  if (!isSameOriginGoogleAdsPost(request)) return googleAdsJson({ error: 'csrf_failed' }, 403)

  const userId = await googleAdsUserId()
  if (!userId) return googleAdsJson({ error: 'not_authenticated' }, 401)
  const rate = checkRateLimit(`google-ads-disconnect:${userId}`, 5, 60_000)
  if (!rate.allowed) return googleAdsJson({ error: 'rate_limited' }, 429)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return googleAdsJson({ error: 'invalid_request' }, 400)
  }
  const connectionId = body && typeof body === 'object' && typeof (body as Record<string, unknown>).connectionId === 'string'
    ? (body as Record<string, string>).connectionId
    : ''
  if (!UUID_PATTERN.test(connectionId)) return googleAdsJson({ error: 'invalid_request' }, 400)

  try {
    await disconnectGoogleAdsConnection(userId, connectionId)
    return googleAdsJson({ ok: true })
  } catch (error) {
    return googleAdsErrorResponse(error instanceof GoogleAdsError ? error : new GoogleAdsError('disconnect_failed'))
  }
}
