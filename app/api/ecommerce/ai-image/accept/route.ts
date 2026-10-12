import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireOwnedEcommerceProject } from '@/lib/ecommerce-access'
import { PRODUCT_IMAGE_ERROR_MESSAGES, PRODUCT_IMAGE_UPLOAD_RATE, isUuid } from '@/lib/product-images'
import { uploadProductImage } from '@/lib/product-image-service'
import { createProductImageStore } from '@/lib/product-image-store'
import { authorizeProductKey } from '@/lib/store-ai-engine'
import { candidatePath, isCandidateFile } from '@/lib/store-ai-image'
import { createCandidateStore } from '@/lib/store-ai-image-store'
import { canAddToGallery, pickAcceptedAlt } from '@/lib/store-ai-image-styles'
import { STORE_AI_ERROR_MESSAGES } from '@/lib/store-ai-messages'
import { createStoreAiPort } from '@/lib/store-ai-port'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 30

function fail(error: keyof typeof STORE_AI_ERROR_MESSAGES, status: number, message?: string) {
  return NextResponse.json({ ok: false, error, message: message ?? STORE_AI_ERROR_MESSAGES[error] }, { status })
}

/**
 * "Galeriye ekle": the chosen candidate goes through the SAME upload pipeline as an
 * owner upload (authorization, quota, type/size checks, re-encode, project folder),
 * then is deleted from the candidate area. No credit moves here.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return fail('invalid_request', 400)

  const { projectId, productKey, candidate, galleryCount } = body
  if (!isUuid(projectId) || !isUuid(productKey) || !isCandidateFile(candidate)) return fail('invalid_request', 400)
  if (!canAddToGallery(galleryCount)) return fail('gallery_full', 409)

  let access: Awaited<ReturnType<typeof requireOwnedEcommerceProject>>
  try {
    access = await requireOwnedEcommerceProject(projectId)
  } catch (error) {
    return error instanceof Error && error.message === 'UNAUTHENTICATED'
      ? fail('unauthenticated', 401)
      : fail('not_found', 404)
  }
  if (access.elevated) return fail('admin_not_supported', 403)

  const port = createStoreAiPort()
  if (!(await authorizeProductKey(port, projectId, productKey))) return fail('not_found', 404)

  const path = candidatePath(projectId, candidate)
  if (!path) return fail('invalid_request', 400)

  const candidates = createCandidateStore()
  const bytes = await candidates.get(path)
  if (!bytes) return fail('candidate_expired', 410)

  const uploaded = await uploadProductImage(
    {
      authorize: async () => ({ actorId: access.userId }),
      rateLimit: (actorId) =>
        checkRateLimit(`product-image-upload:${actorId}`, PRODUCT_IMAGE_UPLOAD_RATE.limit, PRODUCT_IMAGE_UPLOAD_RATE.windowMs),
      store: createProductImageStore(),
      newId: randomUUID,
    },
    projectId,
    bytes,
  )
  if (!uploaded.ok) {
    return NextResponse.json(
      { ok: false, error: uploaded.error, message: PRODUCT_IMAGE_ERROR_MESSAGES[uploaded.error] },
      { status: uploaded.status },
    )
  }

  await candidates.remove([path]).catch(() => undefined)
  // The owner took a result: the retry series starts over, the next attempt is paid.
  await port.resetSeries(projectId, productKey, 'image').catch((error) => {
    console.error('[store-ai] image series reset failed', { error: error instanceof Error ? error.message : String(error) })
  })

  const name = typeof body.name === 'string' ? body.name : ''
  return NextResponse.json({
    ok: true,
    url: uploaded.url,
    alt: pickAcceptedAlt(body.sourceAlt, name),
  })
}
