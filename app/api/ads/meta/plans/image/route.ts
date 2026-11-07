import { createHash, randomUUID } from 'node:crypto'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { META_IMAGE_ERROR_MESSAGES, META_IMAGE_MAX_BYTES, inspectMetaImage } from '@/lib/ads/meta-publish-plan'
import { guardMetaPublishRoute, isUuid } from '@/lib/ads/meta-plan-route'
import { META_CREATIVE_BUCKET, ensureMetaCreativeBucket, getMetaPlan, metaPlanView, setMetaPlanImage } from '@/lib/ads/meta-plans-store'
import { metaAdsErrorResponse, metaAdsJson } from '@/lib/ads/meta-route-utils'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const guard = await guardMetaPublishRoute(request, { key: 'meta-plans-image', limit: 10 })
  if (!guard.ok) return guard.response
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > META_IMAGE_MAX_BYTES + 64 * 1024) {
    return metaAdsJson({ ok: false, error: 'image_invalid', message: META_IMAGE_ERROR_MESSAGES.too_large }, 413)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return metaAdsJson({ ok: false, error: 'invalid_request' }, 400)
  }
  const planId = form.get('planId')
  const file = form.get('file')
  if (!isUuid(planId) || !(file instanceof File)) return metaAdsJson({ ok: false, error: 'invalid_request' }, 400)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = inspectMetaImage(bytes)
  if (!check.ok) return metaAdsJson({ ok: false, error: 'image_invalid', message: META_IMAGE_ERROR_MESSAGES[check.error] }, 400)

  const userId = guard.access.userId
  try {
    const plan = await getMetaPlan(guard.admin, userId, planId)
    if (!plan) throw new MetaAdsError('plan_not_found')
    await ensureMetaCreativeBucket(guard.admin)
    const path = `${userId}/${randomUUID()}.${check.format}`
    const { error } = await guard.admin.storage
      .from(META_CREATIVE_BUCKET)
      .upload(path, bytes, { contentType: check.format === 'png' ? 'image/png' : 'image/jpeg', upsert: false })
    if (error) throw new MetaAdsError('provider_error')
    const updated = await setMetaPlanImage(guard.admin, plan, path, createHash('sha256').update(bytes).digest('hex'))
    return metaAdsJson({ ok: true, plan: metaPlanView(updated), width: check.width, height: check.height })
  } catch (error) {
    return metaAdsErrorResponse(error)
  }
}
