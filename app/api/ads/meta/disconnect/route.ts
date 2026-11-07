import { checkRateLimit } from '@/lib/rate-limit'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { disconnectMetaConnection } from '@/lib/ads/meta-connections'
import { createConfiguredMetaProvider } from '@/lib/ads/meta-provider-factory'
import {
  META_UUID_PATTERN,
  isSameOriginMetaAdsPost,
  metaAdsErrorResponse,
  metaAdsFeatureEnabled,
  metaAdsJson,
  metaAdsRequestAccess,
} from '@/lib/ads/meta-route-utils'

export const dynamic = 'force-dynamic'

/** Disconnect stays available while the kill switch is on: the owner can always remove their token. */
export async function POST(request: Request) {
  if (!metaAdsFeatureEnabled()) return metaAdsJson({ error: 'not_found' }, 404)
  if (!isSameOriginMetaAdsPost(request)) return metaAdsJson({ error: 'csrf_failed' }, 403)

  const access = await metaAdsRequestAccess()
  if (!access) return metaAdsJson({ error: 'not_authenticated' }, 401)
  if (access.decision.mode === 'off') return metaAdsJson({ error: 'not_found' }, 404)
  if (!checkRateLimit(`meta-ads-disconnect:${access.userId}`, 5, 60_000).allowed) {
    return metaAdsJson({ error: 'rate_limited' }, 429)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return metaAdsJson({ error: 'invalid_request' }, 400)
  }
  const connectionId = body && typeof body === 'object' && typeof (body as Record<string, unknown>).connectionId === 'string'
    ? (body as Record<string, string>).connectionId
    : ''
  if (!META_UUID_PATTERN.test(connectionId)) return metaAdsJson({ error: 'invalid_request' }, 400)

  const configured = createConfiguredMetaProvider()
  if (!configured.ok) return metaAdsJson({ error: 'configuration_missing' }, 503)

  try {
    await disconnectMetaConnection({ userId: access.userId, connectionId, provider: configured.provider })
    return metaAdsJson({ ok: true })
  } catch (error) {
    return metaAdsErrorResponse(error instanceof MetaAdsError ? error : new MetaAdsError('disconnect_failed'))
  }
}
