import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireOwnedEcommerceProject } from '@/lib/ecommerce-access'
import { PRODUCT_IMAGE_LIMITS, PRODUCT_IMAGE_UPLOAD_RATE } from '@/lib/product-images'
import { uploadProductImage } from '@/lib/product-image-service'
import { createProductImageStore } from '@/lib/product-image-store'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Multipart overhead allowance on top of the file limit; stays under Vercel's ~4.5 MB body cap. */
const BODY_SLACK_BYTES = 256 * 1024

function fail(error: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ ok: false, error }, { status, headers })
}

export async function POST(request: Request) {
  try {
    const declared = Number(request.headers.get('content-length') ?? 0)
    if (declared > PRODUCT_IMAGE_LIMITS.maxBytes + BODY_SLACK_BYTES) {
      return fail('too_large', 413)
    }

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return fail('invalid_request', 400)
    }

    const projectId = form.get('projectId')
    const file = form.get('file')
    if (typeof projectId !== 'string' || !(file instanceof File)) {
      return fail('invalid_request', 400)
    }

    const result = await uploadProductImage(
      {
        authorize: async (id) => {
          const { actorId } = await requireOwnedEcommerceProject(id)
          return { actorId }
        },
        rateLimit: (actorId) =>
          checkRateLimit(
            `product-image-upload:${actorId}`,
            PRODUCT_IMAGE_UPLOAD_RATE.limit,
            PRODUCT_IMAGE_UPLOAD_RATE.windowMs,
          ),
        store: createProductImageStore(),
        newId: randomUUID,
      },
      projectId,
      Buffer.from(await file.arrayBuffer()),
    )

    if (!result.ok) {
      return fail(
        result.error,
        result.status,
        result.retryAfterSeconds ? { 'Retry-After': String(result.retryAfterSeconds) } : undefined,
      )
    }
    return NextResponse.json({ ok: true, url: result.url })
  } catch (err) {
    console.error('[product-images] upload route failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return fail('server_error', 500)
  }
}
