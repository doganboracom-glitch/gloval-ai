import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireOwnedEcommerceProject } from '@/lib/ecommerce-access'
import { PRODUCT_IMAGE_LIMITS } from '@/lib/product-images'
import { uploadProductImage } from '@/lib/product-image-service'
import { createProductImageStore } from '@/lib/product-image-store'

export const runtime = 'nodejs'
export const maxDuration = 30

/** Multipart overhead allowance on top of the file limit. */
const BODY_SLACK_BYTES = 256 * 1024

export async function POST(request: Request) {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > PRODUCT_IMAGE_LIMITS.maxBytes + BODY_SLACK_BYTES) {
    return NextResponse.json({ ok: false, error: 'too_large' }, { status: 413 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }

  const projectId = form.get('projectId')
  const file = form.get('file')
  if (typeof projectId !== 'string' || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }

  const result = await uploadProductImage(
    {
      authorize: async (id) => {
        await requireOwnedEcommerceProject(id)
      },
      store: createProductImageStore(),
      newId: randomUUID,
    },
    projectId,
    Buffer.from(await file.arrayBuffer()),
  )

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, url: result.url })
}
