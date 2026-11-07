import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { resolveMetaGraphApiVersion } from '@/lib/ads/env'
import { createMetaApiClient } from '@/lib/ads/meta-api-client'
import { withMetaAccess } from '@/lib/ads/meta-connections'
import { decideMetaSync, readMetaLiveState, toLiveSnapshot } from '@/lib/ads/meta-manage'
import { guardMetaPublishRoute, isUuid, readJsonObject } from '@/lib/ads/meta-plan-route'
import { getMetaPlan, metaPlanView } from '@/lib/ads/meta-plans-store'
import { metaAdsErrorResponse, metaAdsJson } from '@/lib/ads/meta-route-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SYNCABLE = new Set(['published', 'active', 'user_paused'])
/** A plan synced within this window is returned from the database; protects the Graph read quota. */
const FRESH_WINDOW_MS = 20_000

/**
 * Reads the live state of a created campaign from Meta and writes any change made outside GLOVAL
 * (paused or re-budgeted in Ads Manager, ad rejected) back onto the plan. Read-only toward Meta.
 */
export async function POST(request: Request) {
  const guard = await guardMetaPublishRoute(request, { key: 'meta-plans-sync', limit: 12 })
  if (!guard.ok) return guard.response
  const body = await readJsonObject(request)
  if (!body || !isUuid(body.planId)) return metaAdsJson({ ok: false, error: 'invalid_request' }, 400)
  const { userId } = guard.access
  const admin = guard.admin

  try {
    const plan = await getMetaPlan(admin, userId, body.planId)
    if (!plan) throw new MetaAdsError('plan_not_found')
    if (!SYNCABLE.has(plan.status) || !plan.meta_campaign_id || !plan.meta_adset_id || !plan.meta_ad_id) {
      return metaAdsJson({ ok: true, synced: false, plan: metaPlanView(plan), live: null })
    }
    if (plan.last_synced_at && Date.now() - Date.parse(plan.last_synced_at) < FRESH_WINDOW_MS) {
      return metaAdsJson({ ok: true, synced: false, plan: metaPlanView(plan), live: plan.live_snapshot })
    }
    const ids = { campaignId: plan.meta_campaign_id, adSetId: plan.meta_adset_id, adId: plan.meta_ad_id }

    const graph = createMetaApiClient()
    const apiVersion = resolveMetaGraphApiVersion()
    const live = await withMetaAccess({
      userId,
      connectionId: plan.connection_id,
      action: ({ connection, accessToken, context }) =>
        readMetaLiveState({ graph, accessToken, context, accountId: connection.external_account_id, apiVersion, ids }),
    })

    const decision = decideMetaSync({ status: plan.status, dailyBudgetMinor: plan.daily_budget_minor }, live)
    const { error } = await admin.rpc('ads_sync_meta_plan_state', {
      p_user_id: userId,
      p_plan_id: plan.id,
      p_new_plan_status: decision.planStatus,
      p_new_budget_minor: decision.budgetMinor,
      p_effective_status: decision.effectiveStatus,
      p_snapshot: toLiveSnapshot(live),
    }).maybeSingle()
    if (error) throw new MetaAdsError('provider_error')

    const fresh = await getMetaPlan(admin, userId, plan.id)
    return metaAdsJson({ ok: true, synced: true, drift: decision.drift, plan: fresh ? metaPlanView(fresh) : null, live })
  } catch (error) {
    return metaAdsErrorResponse(error)
  }
}
