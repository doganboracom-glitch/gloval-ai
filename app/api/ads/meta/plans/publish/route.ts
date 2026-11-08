import { resolveMetaGraphApiVersion, resolveMetaPublishLimits } from '@/lib/ads/env'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { createMetaApiClient } from '@/lib/ads/meta-api-client'
import { withMetaAccess } from '@/lib/ads/meta-connections'
import { EMPTY_OBJECTS, preflightMetaAccount, publishPausedMetaCampaign, type MetaPublishObjects } from '@/lib/ads/meta-publish'
import { finishMetaPublish, reserveMetaPublish, settleMetaPublishCredit } from '@/lib/ads/meta-publish-credits'
import { metaCreditStateNotice, type MetaCreditState } from '@/lib/ads/meta-publish-ux'
import { adsManagerUrl, metaPlanHash, metaRequestTag, validateMetaPlanContent } from '@/lib/ads/meta-publish-plan'
import { buildMetaPublishResultEmail, type MetaPublishMailOutcome } from '@/lib/email/ads-mail'
import { logUserEvent } from '@/lib/notify'
import { META_STEP_LABELS, buildStoredFailureReason } from '@/lib/ads/meta-publish-errors'
import { formatMetaCodePair, formatMetaTechnicalDetail, metaErrorAuditState } from '@/lib/ads/meta-error-detail'
import { assertMetaPublishable, guardMetaPublishRoute, isUuid, readJsonObject } from '@/lib/ads/meta-plan-route'
import { META_CREATIVE_BUCKET, appendMetaAction, getMetaPlan, metaPlanView, saveMetaPlanObject } from '@/lib/ads/meta-plans-store'
import { metaAdsErrorResponse, metaAdsJson, metaDsaBlockedResponse } from '@/lib/ads/meta-route-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const COLUMNS = {
  campaign: 'meta_campaign_id',
  adset: 'meta_adset_id',
  image: 'meta_image_hash',
  creative: 'meta_creative_id',
  ad: 'meta_ad_id',
} as const

const MAIL_SUBJECTS: Record<MetaPublishMailOutcome, string> = {
  published: 'Meta kampanyanız duraklatılmış olarak oluşturuldu',
  partial: 'Meta kampanyanız kısmen oluşturuldu',
  failed: 'Meta yayını tamamlanamadı',
}

/** Best-effort customer e-mail; a delivery problem never changes the publish result. Deduped per request id. */
async function notifyMetaPublishOutcome(input: {
  userId: string
  requestId: string
  outcome: MetaPublishMailOutcome
  campaignName: string
  adsManagerUrl: string | null
}) {
  try {
    await logUserEvent({
      userId: input.userId,
      type: `meta_ads_publish_${input.outcome}`,
      subject: MAIL_SUBJECTS[input.outcome],
      body: MAIL_SUBJECTS[input.outcome],
      userEmail: () => buildMetaPublishResultEmail(input),
      dedupeKey: `meta_ads_publish_${input.outcome}_${input.requestId}`,
    })
  } catch {
    // Intentionally swallowed.
  }
}

export async function POST(request: Request) {
  const guard = await guardMetaPublishRoute(request, { key: 'meta-plans-publish', limit: 3 })
  if (!guard.ok) return guard.response
  const body = await readJsonObject(request)
  if (!body || !isUuid(body.planId) || !isUuid(body.requestId)) return metaAdsJson({ ok: false, error: 'invalid_request' }, 400)
  const userId = guard.access.userId
  const admin = guard.admin

  try {
    const plan = await getMetaPlan(admin, userId, body.planId)
    if (!plan) throw new MetaAdsError('plan_not_found')
    if (plan.status === 'publishing') throw new MetaAdsError('publish_in_progress')
    if (plan.status === 'published' || plan.meta_ad_id) {
      // A publish whose charge failed earlier is retried here (idempotent; never charges a plan twice).
      const settled = await settleMetaPublishCredit(admin, userId, plan.id)
      return metaAdsJson({
        ok: true,
        alreadyPublished: true,
        credit: { state: settled, notice: metaCreditStateNotice(settled) },
        plan: metaPlanView(plan),
      })
    }
    if (!['approved', 'partial', 'failed'].includes(plan.status) || plan.approved_version !== plan.version || !plan.plan_hash) {
      throw new MetaAdsError('plan_not_approved')
    }

    const dsaBlocked = metaDsaBlockedResponse(plan.content.countries)
    if (dsaBlocked) return dsaBlocked

    const checked = validateMetaPlanContent(plan.content, { currency: plan.currency, requireImage: true })
    if (!checked.ok || !plan.content.imagePath || !plan.image_sha256) throw new MetaAdsError('plan_invalid')
    const imagePath = plan.content.imagePath
    const content = checked.value.content

    const limits = resolveMetaPublishLimits()
    // Holds 15 credits and the daily attempt in one transaction; insufficient credits stop here, before any Meta write.
    const { actionId } = await reserveMetaPublish(admin, {
      userId,
      planId: plan.id,
      connectionId: plan.connection_id,
      requestId: body.requestId,
      perUserLimit: limits.perUser,
      globalLimit: limits.global,
    })

    let creditState: MetaCreditState = 'none'
    const finish = async (outcome: 'published' | 'partial' | 'failed', objects: MetaPublishObjects, failure?: { step: string; code: string; reason: string }) => {
      const result = await finishMetaPublish(admin, { userId, planId: plan.id, actionId, outcome, objects, failure })
      creditState = result.creditState
    }

    const graph = createMetaApiClient()
    const apiVersion = resolveMetaGraphApiVersion()
    const startObjects: MetaPublishObjects = {
      campaignId: plan.meta_campaign_id,
      adSetId: plan.meta_adset_id,
      imageHash: plan.meta_image_hash,
      creativeId: plan.meta_creative_id,
      adId: plan.meta_ad_id,
    }

    let accountExternalId: string | null = null
    const outcome = await withMetaAccess({
      userId,
      connectionId: plan.connection_id,
      action: async ({ connection, accessToken, context }) => {
        assertMetaPublishable(connection)
        accountExternalId = connection.external_account_id
        if (connection.currency_code !== plan.currency) throw new MetaAdsError('plan_changed')
        // Same hash as at approval: any change since then (content, image, account) blocks publishing.
        const hash = metaPlanHash(plan.content, { connectionId: connection.id, currency: plan.currency, imageSha: plan.image_sha256 })
        if (hash !== plan.plan_hash) throw new MetaAdsError('plan_changed')

        const common = { graph, accessToken, context, accountId: connection.external_account_id, apiVersion }
        const pre = await preflightMetaAccount(common, {
          pageId: connection.page_id,
          instagramAccountId: connection.instagram_account_id,
        })
        if (!pre.ok) return { ok: false as const, step: 'preflight' as const, failure: pre.failure, objects: startObjects }

        return publishPausedMetaCampaign({
          ...common,
          content,
          dailyBudgetMinor: checked.value.dailyBudgetMinor,
          tag: metaRequestTag(plan.request_id),
          pageId: connection.page_id as string,
          instagramAccountId: connection.instagram_account_id,
          objects: startObjects,
          loadImage: async () => {
            const { data, error } = await admin.storage.from(META_CREATIVE_BUCKET).download(imagePath)
            if (error || !data) throw new MetaAdsError('image_invalid')
            return { bytes: new Uint8Array(await data.arrayBuffer()), filename: `${metaRequestTag(plan.request_id)}.${imagePath.endsWith('.png') ? 'png' : 'jpg'}` }
          },
          onStep: async (step, objectId, source) => {
            // Already stored on the plan and already audited by the run that created it: re-saving would only add a duplicate ads_meta_actions row.
            if (source === 'reused') return
            if (step !== 'preflight') await saveMetaPlanObject(admin, plan, COLUMNS[step], objectId)
            await appendMetaAction(admin, {
              userId, planId: plan.id, connectionId: plan.connection_id, actor: 'system', actionType: `meta_publish_${step}`,
              target: { object_id: objectId, source }, status: 'applied',
            })
          },
          onWriteFailure: async (step, error) => {
            await appendMetaAction(admin, {
              userId,
              planId: plan.id,
              connectionId: plan.connection_id,
              actor: 'system',
              actionType: `meta_publish_${step}`,
              target: { endpoint: error.endpoint },
              afterState: { meta_error: { endpoint: error.endpoint, internal_code: error.code, ...metaErrorAuditState(error.detail) } },
              status: 'failed',
            })
          },
        })
      },
    })

    const mailOutcome: MetaPublishMailOutcome = outcome.ok ? 'published' : outcome.objects.campaignId ? 'partial' : 'failed'
    if (outcome.ok) {
      await finish('published', outcome.objects)
    } else {
      const failureReason = buildStoredFailureReason(outcome.failure)
      if ('lookupFailures' in outcome && outcome.lookupFailures.length > 0) {
        await appendMetaAction(admin, {
          userId, planId: plan.id, connectionId: plan.connection_id, actor: 'system', actionType: 'meta_publish_tag_lookup',
          target: { failures: outcome.lookupFailures.map((entry) => ({ step: entry.step, endpoint: entry.endpoint, code: entry.code })) },
          status: 'failed',
        }).catch(() => console.error('[meta-ads] lookup-failure audit failed'))
      }
      await finish(mailOutcome === 'partial' ? 'partial' : 'failed', outcome.objects, {
        step: outcome.step, code: outcome.failure.code, reason: failureReason,
      })
    }
    await notifyMetaPublishOutcome({
      userId,
      requestId: body.requestId,
      outcome: mailOutcome,
      campaignName: plan.content.name,
      adsManagerUrl: accountExternalId && outcome.objects.campaignId ? adsManagerUrl(accountExternalId, outcome.objects.campaignId) : null,
    })
    const fresh = await getMetaPlan(admin, userId, plan.id)
    if (outcome.ok) {
      return metaAdsJson({
        ok: true,
        credit: { state: creditState, notice: metaCreditStateNotice(creditState) },
        plan: fresh ? metaPlanView(fresh) : null,
      })
    }
    return metaAdsJson({
      ok: false,
      error: outcome.failure.code,
      step: outcome.step,
      stepLabel: META_STEP_LABELS[outcome.step],
      message: outcome.failure.message,
      metaReason: outcome.failure.metaReason,
      technicalDetail: formatMetaTechnicalDetail(outcome.failure.detail),
      metaCode: formatMetaCodePair(outcome.failure.detail),
      endpoint: outcome.failure.endpoint ?? null,
      blamedFields: outcome.failure.blamedFields,
      partial: Boolean(outcome.objects.campaignId),
      plan: fresh ? metaPlanView(fresh) : null,
    }, 422)
  } catch (error) {
    return metaAdsErrorResponse(error)
  }
}

export { EMPTY_OBJECTS as _emptyObjects }
