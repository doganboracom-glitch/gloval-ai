import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { getMetaConnectionForUser } from '@/lib/ads/meta-connections'
import { evaluateMetaCopyPolicy } from '@/lib/ads/meta-ad-policy'
import { validateMetaPlanContent } from '@/lib/ads/meta-publish-plan'
import { assertMetaPublishable, guardMetaPublishRoute, isUuid, readJsonObject } from '@/lib/ads/meta-plan-route'
import { createMetaPlan, getMetaPlan, listMetaPlans, metaPlanView, updateMetaPlanContent } from '@/lib/ads/meta-plans-store'
import { metaAdsErrorResponse, metaAdsJson } from '@/lib/ads/meta-route-utils'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const guard = await guardMetaPublishRoute(request, { key: 'meta-plans-list', limit: 60 })
  if (!guard.ok) return guard.response
  const connectionId = new URL(request.url).searchParams.get('connectionId')
  if (!isUuid(connectionId)) return metaAdsJson({ ok: false, error: 'invalid_request' }, 400)
  try {
    const rows = await listMetaPlans(guard.admin, guard.access.userId, connectionId)
    return metaAdsJson({ ok: true, plans: rows.map(metaPlanView) })
  } catch (error) {
    return metaAdsErrorResponse(error)
  }
}

export async function POST(request: Request) {
  const guard = await guardMetaPublishRoute(request, { key: 'meta-plans-save', limit: 30 })
  if (!guard.ok) return guard.response
  const body = await readJsonObject(request)
  if (!body || !isUuid(body.connectionId) || (body.planId !== undefined && !isUuid(body.planId))) {
    return metaAdsJson({ ok: false, error: 'invalid_request' }, 400)
  }
  const userId = guard.access.userId
  try {
    const connection = await getMetaConnectionForUser(guard.admin, userId, body.connectionId)
    if (!connection) throw new MetaAdsError('connection_not_found')
    assertMetaPublishable(connection)
    if (!connection.currency_code) throw new MetaAdsError('plan_invalid')

    const checked = validateMetaPlanContent(body.content, { currency: connection.currency_code })
    if (!checked.ok) return metaAdsJson({ ok: false, error: 'plan_invalid', fieldErrors: checked.errors }, 400)

    const { content } = checked.value
    const policy = evaluateMetaCopyPolicy([content.name, content.primaryText, content.headline, content.description])
    if (policy.blocked.length > 0) return metaAdsJson({ ok: false, error: 'policy_blocked', blocked: policy.blocked }, 400)

    let plan
    if (typeof body.planId === 'string') {
      const existing = await getMetaPlan(guard.admin, userId, body.planId)
      if (!existing || existing.connection_id !== connection.id) throw new MetaAdsError('plan_not_found')
      // Image storage metadata is server-owned; preserve the uploaded creative across content edits.
      plan = await updateMetaPlanContent(guard.admin, existing, {
        content: {
          ...content,
          imagePath: existing.content.imagePath ?? null,
          imageFilename: existing.content.imageFilename ?? null,
        },
        dailyBudgetMinor: checked.value.dailyBudgetMinor,
      })
    } else {
      plan = await createMetaPlan(guard.admin, {
        userId,
        connectionId: connection.id,
        content: { ...content, imagePath: null, imageFilename: null },
        currency: connection.currency_code,
        dailyBudgetMinor: checked.value.dailyBudgetMinor,
      })
    }
    return metaAdsJson({ ok: true, plan: metaPlanView(plan), warnings: policy.warnings })
  } catch (error) {
    return metaAdsErrorResponse(error)
  }
}
