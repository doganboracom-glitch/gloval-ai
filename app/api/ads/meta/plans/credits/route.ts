import { guardMetaPublishRoute } from '@/lib/ads/meta-plan-route'
import { getMetaPublishCreditInfo } from '@/lib/ads/meta-publish-credits'
import { metaAdsErrorResponse, metaAdsJson } from '@/lib/ads/meta-route-utils'

export const dynamic = 'force-dynamic'

/** Balance, open holds and spendable credits for the publish approval summary. */
export async function GET(request: Request) {
  const guard = await guardMetaPublishRoute(request, { key: 'meta-publish-credits', limit: 30 })
  if (!guard.ok) return guard.response
  try {
    const credits = await getMetaPublishCreditInfo(guard.admin, guard.access.userId)
    return metaAdsJson({ ok: true, credits })
  } catch (error) {
    return metaAdsErrorResponse(error)
  }
}
