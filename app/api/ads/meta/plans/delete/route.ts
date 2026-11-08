import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { createMetaApiClient } from '@/lib/ads/meta-api-client'
import { withMetaAccess } from '@/lib/ads/meta-connections'
import { metaPlanIsActive, readMetaPlanDeletionStatuses, type MetaPlanDeletionStatuses } from '@/lib/ads/meta-plan-deletion'
import { assertMetaManageable, guardMetaSyncRoute, isUuid, readJsonObject } from '@/lib/ads/meta-plan-route'
import { getMetaPlan, softDeleteMetaPlan } from '@/lib/ads/meta-plans-store'
import { metaAdsErrorResponse, metaAdsJson } from '@/lib/ads/meta-route-utils'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const guard = await guardMetaSyncRoute(request, { key: 'meta-plan-delete', limit: 8 })
  if (!guard.ok) return guard.response
  const body = await readJsonObject(request)
  if (!body || !isUuid(body.planId)) return metaAdsJson({ ok: false, error: 'invalid_request' }, 400)

  try {
    const plan = await getMetaPlan(guard.admin, guard.access.userId, body.planId)
    if (!plan) throw new MetaAdsError('plan_not_found')

    const ids = {
      campaignId: plan.meta_campaign_id,
      adSetId: plan.meta_adset_id,
      adId: plan.meta_ad_id,
    }
    const hasMetaObjects = Object.values(ids).some(Boolean)
    let metaStatuses: MetaPlanDeletionStatuses | null = null

    if (hasMetaObjects) {
      const graph = createMetaApiClient()
      metaStatuses = await withMetaAccess({
        userId: guard.access.userId,
        connectionId: plan.connection_id,
        action: async ({ connection, accessToken, context }) => {
          assertMetaManageable(connection)
          try {
            return await readMetaPlanDeletionStatuses({
              graph,
              accessToken,
              context,
              ids,
            })
          } catch {
            throw new MetaAdsError('meta_inactive_unconfirmed')
          }
        },
      })
      if (metaPlanIsActive(metaStatuses)) throw new MetaAdsError('meta_plan_active')
    }

    await softDeleteMetaPlan(guard.admin, {
      userId: guard.access.userId,
      planId: plan.id,
      metaStatuses,
    })
    return metaAdsJson({ ok: true, planId: plan.id })
  } catch (error) {
    return metaAdsErrorResponse(error)
  }
}
