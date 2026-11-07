import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { getMetaConnectionForUser } from '@/lib/ads/meta-connections'
import { META_APPROVAL_TEXT, META_APPROVAL_VERSION, metaPlanHash } from '@/lib/ads/meta-publish-plan'
import { assertMetaPublishable, guardMetaPublishRoute, isUuid, readJsonObject } from '@/lib/ads/meta-plan-route'
import { getMetaPlan } from '@/lib/ads/meta-plans-store'
import { metaAdsErrorResponse, metaAdsJson } from '@/lib/ads/meta-route-utils'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const guard = await guardMetaPublishRoute(request, { key: 'meta-plans-approval', limit: 10 })
  if (!guard.ok) return guard.response
  const body = await readJsonObject(request)
  if (!body || !isUuid(body.planId) || !Number.isInteger(body.expectedVersion)) {
    return metaAdsJson({ ok: false, error: 'invalid_request' }, 400)
  }
  if (body.termsAccepted !== true) return metaAdsJson({ ok: false, error: 'terms_not_accepted' }, 400)
  const userId = guard.access.userId

  try {
    const plan = await getMetaPlan(guard.admin, userId, body.planId)
    if (!plan) throw new MetaAdsError('plan_not_found')
    if (plan.version !== body.expectedVersion) throw new MetaAdsError('plan_changed')
    if (plan.validated_version !== plan.version) return metaAdsJson({ ok: false, error: 'validation_required' }, 409)

    const connection = await getMetaConnectionForUser(guard.admin, userId, plan.connection_id)
    if (!connection) throw new MetaAdsError('connection_not_found')
    assertMetaPublishable(connection)
    if (connection.currency_code !== plan.currency) throw new MetaAdsError('plan_changed')
    if (!plan.content.imagePath || !plan.image_sha256) throw new MetaAdsError('image_invalid')

    const planHash = metaPlanHash(plan.content, { connectionId: connection.id, currency: plan.currency, imageSha: plan.image_sha256 })
    const summary = {
      termsVersion: META_APPROVAL_VERSION,
      termsText: META_APPROVAL_TEXT,
      status: 'PAUSED',
      accountName: connection.external_account_name,
      accountId: connection.external_account_id,
      pageName: connection.page_name,
      instagramAccount: connection.instagram_account_name,
      currency: plan.currency,
      dailyBudgetMinor: plan.daily_budget_minor,
      campaignName: plan.content.name,
      landingUrl: plan.content.landingUrl,
      countries: plan.content.countries,
      endDate: plan.content.endDate,
    }

    const { data, error } = await guard.admin.rpc('ads_approve_meta_plan', {
      p_user_id: userId,
      p_plan_id: plan.id,
      p_expected_version: plan.version,
      p_connection_id: connection.id,
      p_plan_hash: planHash,
      p_approval_summary: summary,
    }).maybeSingle()
    if (error || !data) throw new MetaAdsError('provider_error')
    const result = data as { state?: string; approval_id?: string; plan_version?: number }
    if (result.state !== 'approved') {
      const status = result.state === 'not_found' ? 404 : 409
      return metaAdsJson({ ok: false, error: result.state ?? 'plan_not_approved' }, status)
    }
    return metaAdsJson({ ok: true, approvalId: result.approval_id, planVersion: result.plan_version, summary })
  } catch (error) {
    return metaAdsErrorResponse(error)
  }
}
