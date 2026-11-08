import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { createMetaApiClient } from '@/lib/ads/meta-api-client'
import { withMetaAccess } from '@/lib/ads/meta-connections'
import { getMetaMinimumDailyBudget } from '@/lib/ads/meta-budget'
import { META_OPTIMIZATION_GOALS } from '@/lib/ads/meta-publish-plan'
import { assertMetaPublishable, guardMetaPublishRoute, isUuid } from '@/lib/ads/meta-plan-route'
import { metaAdsErrorResponse, metaAdsJson } from '@/lib/ads/meta-route-utils'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const guard = await guardMetaPublishRoute(request, { key: 'meta-minimum-budget', limit: 30 })
  if (!guard.ok) return guard.response
  const params = new URL(request.url).searchParams
  const connectionId = params.get('connectionId')
  const optimizationGoal = params.get('optimizationGoal') ?? 'LANDING_PAGE_VIEWS'
  if (!isUuid(connectionId) || !META_OPTIMIZATION_GOALS.includes(optimizationGoal as (typeof META_OPTIMIZATION_GOALS)[number])) {
    return metaAdsJson({ ok: false, error: 'invalid_request' }, 400)
  }

  try {
    const graph = createMetaApiClient()
    const minimumDailyBudgetMinor = await withMetaAccess({
      userId: guard.access.userId,
      connectionId,
      action: async ({ connection, accessToken, context }) => {
        assertMetaPublishable(connection)
        return getMetaMinimumDailyBudget({
          graph,
          accessToken,
          context,
          accountId: connection.external_account_id,
          connectionId: connection.id,
          currency: connection.currency_code ?? '',
          optimizationGoal: optimizationGoal as (typeof META_OPTIMIZATION_GOALS)[number],
        })
      },
    })
    return metaAdsJson({
      ok: true,
      minimumDailyBudgetMinor,
      validationSource: minimumDailyBudgetMinor === null ? 'validate_only' : 'minimum_budgets',
    })
  } catch (error) {
    return metaAdsErrorResponse(error)
  }
}
