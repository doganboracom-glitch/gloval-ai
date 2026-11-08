import { resolveMetaGraphApiVersion } from '@/lib/ads/env'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { createMetaApiClient } from '@/lib/ads/meta-api-client'
import { withMetaAccess } from '@/lib/ads/meta-connections'
import { evaluateMetaCopyPolicy } from '@/lib/ads/meta-ad-policy'
import { getMetaMinimumDailyBudget } from '@/lib/ads/meta-budget'
import { preflightMetaAccount, validateMetaPlanRemote } from '@/lib/ads/meta-publish'
import { metaRequestTag, validateMetaPlanContent } from '@/lib/ads/meta-publish-plan'
import { assertMetaPublishable, guardMetaPublishRoute, isUuid, readJsonObject } from '@/lib/ads/meta-plan-route'
import { appendMetaAction, getMetaPlan, markMetaPlanValidated } from '@/lib/ads/meta-plans-store'
import { metaAdsErrorResponse, metaAdsJson, metaDsaBlockedResponse } from '@/lib/ads/meta-route-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const guard = await guardMetaPublishRoute(request, { key: 'meta-plans-validate', limit: 6 })
  if (!guard.ok) return guard.response
  const body = await readJsonObject(request)
  if (!body || !isUuid(body.planId)) return metaAdsJson({ ok: false, error: 'invalid_request' }, 400)
  const userId = guard.access.userId

  try {
    const plan = await getMetaPlan(guard.admin, userId, body.planId)
    if (!plan) throw new MetaAdsError('plan_not_found')
    if (!['draft', 'validated', 'approved', 'failed', 'partial'].includes(plan.status)) throw new MetaAdsError('plan_changed')

    const dsaBlocked = metaDsaBlockedResponse(plan.content.countries)
    if (dsaBlocked) return dsaBlocked

    const checked = validateMetaPlanContent(plan.content, { currency: plan.currency, requireImage: true })
    if (!checked.ok) return metaAdsJson({ ok: false, error: 'plan_invalid', fieldErrors: checked.errors }, 400)
    if (!plan.content.imagePath || !plan.image_sha256) throw new MetaAdsError('image_invalid')
    const policy = evaluateMetaCopyPolicy([checked.value.content.name, checked.value.content.primaryText, checked.value.content.headline, checked.value.content.description])
    if (policy.blocked.length > 0) return metaAdsJson({ ok: false, error: 'policy_blocked', blocked: policy.blocked }, 400)

    const graph = createMetaApiClient()
    const apiVersion = resolveMetaGraphApiVersion()
    const result = await withMetaAccess({
      userId,
      connectionId: plan.connection_id,
      action: async ({ connection, accessToken, context }) => {
        assertMetaPublishable(connection)
        if (connection.currency_code !== plan.currency) throw new MetaAdsError('plan_changed')
        let minimumBudgetMinor: number | null = null
        try {
          minimumBudgetMinor = await getMetaMinimumDailyBudget({
            graph,
            accessToken,
            context,
            accountId: connection.external_account_id,
            connectionId: connection.id,
            currency: connection.currency_code ?? '',
            optimizationGoal: checked.value.content.optimizationGoal ?? 'LANDING_PAGE_VIEWS',
          })
        } catch {
          // The Meta validate_only request below remains authoritative when this read is unavailable.
        }
        const checkedWithMetaMinimum = validateMetaPlanContent(plan.content, {
          currency: plan.currency,
          requireImage: true,
          minimumBudgetMinor,
        })
        if (!checkedWithMetaMinimum.ok) {
          return { ok: false as const, fieldErrors: checkedWithMetaMinimum.errors }
        }
        const common = { graph, accessToken, context, accountId: connection.external_account_id, apiVersion }
        const pre = await preflightMetaAccount(common)
        if (!pre.ok) return { ok: false as const, step: 'preflight' as const, failure: pre.failure }
        return validateMetaPlanRemote({
          ...common,
          content: checked.value.content,
          dailyBudgetMinor: checked.value.dailyBudgetMinor,
          tag: metaRequestTag(plan.request_id),
          hasInstagram: Boolean(connection.instagram_account_id),
          objects: {
            campaignId: plan.meta_campaign_id,
            adSetId: plan.meta_adset_id,
            imageHash: plan.meta_image_hash,
            creativeId: plan.meta_creative_id,
            adId: plan.meta_ad_id,
          },
        })
      },
    })

    if (!result.ok && 'fieldErrors' in result) {
      return metaAdsJson({ ok: false, error: 'plan_invalid', fieldErrors: result.fieldErrors }, 400)
    }
    if (!result.ok) {
      await appendMetaAction(guard.admin, {
        userId, planId: plan.id, connectionId: plan.connection_id, actor: 'system', actionType: 'meta_validate_only',
        target: { plan_version: plan.version }, afterState: { step: result.step, code: result.failure.code }, status: 'failed',
      })
      return metaAdsJson({ ok: false, error: result.failure.code, step: result.step, message: result.failure.message, metaReason: result.failure.metaReason, blamedFields: result.failure.blamedFields }, 422)
    }
    await markMetaPlanValidated(guard.admin, plan)
    await appendMetaAction(guard.admin, {
      userId, planId: plan.id, connectionId: plan.connection_id, actor: 'system', actionType: 'meta_validate_only',
      target: { plan_version: plan.version }, afterState: { checked: result.checked, deferred: result.deferred }, status: 'applied',
    })
    return metaAdsJson({ ok: true, version: plan.version, checked: result.checked, deferred: result.deferred, warnings: policy.warnings })
  } catch (error) {
    return metaAdsErrorResponse(error)
  }
}
