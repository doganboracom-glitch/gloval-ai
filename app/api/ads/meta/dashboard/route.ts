import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { META_RANGES, type MetaAdsRange } from '@/lib/ads/meta-ads-shared'
import { getMetaPerformanceReport } from '@/lib/ads/meta-insights-server'
import { createConfiguredMetaProvider } from '@/lib/ads/meta-provider-factory'
import {
  META_UUID_PATTERN,
  metaAdsErrorResponse,
  metaAdsFeatureEnabled,
  metaAdsJson,
  metaAdsKillSwitchActive,
  metaAdsRequestAccess,
} from '@/lib/ads/meta-route-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: Request) {
  if (!metaAdsFeatureEnabled()) return metaAdsJson({ error: 'not_found' }, 404)
  const access = await metaAdsRequestAccess()
  if (!access) return metaAdsJson({ error: 'not_authenticated' }, 401)
  if (!access.decision.canConnect) return metaAdsJson({ error: 'not_found' }, 404)
  if (metaAdsKillSwitchActive()) return metaAdsJson({ error: 'kill_switch_active' }, 503)

  const url = new URL(request.url)
  const connectionId = url.searchParams.get('connectionId') ?? ''
  const rangeValue = url.searchParams.get('range') ?? '7d'
  if (!META_UUID_PATTERN.test(connectionId) || !(META_RANGES as readonly string[]).includes(rangeValue)) {
    return metaAdsJson({ error: 'invalid_request' }, 400)
  }

  const configured = createConfiguredMetaProvider()
  if (!configured.ok) return metaAdsJson({ error: 'configuration_missing' }, 503)

  try {
    const { report, cached } = await getMetaPerformanceReport({
      userId: access.userId,
      connectionId,
      range: rangeValue as MetaAdsRange,
      provider: configured.provider,
    })
    return metaAdsJson({ ok: true, report, cached, refreshedAt: new Date().toISOString() })
  } catch (error) {
    return metaAdsErrorResponse(error instanceof MetaAdsError ? error : new MetaAdsError('provider_error'))
  }
}
