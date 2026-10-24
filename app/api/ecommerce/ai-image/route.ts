import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireOwnedEcommerceProject } from '@/lib/ecommerce-access'
import { getProductImageStorageBase } from '@/lib/product-image-store'
import { PRODUCT_IMAGE_LIMITS, isOwnProjectImage, isUuid } from '@/lib/product-images'
import { STORE_AI_IMAGE } from '@/lib/store-ai-constants'
import { readStoreAiStatus, runMeteredStoreAi } from '@/lib/store-ai-engine'
import { generateImageCandidate, generateWithGateway, sweepExpiredCandidates } from '@/lib/store-ai-image'
import { createCandidateStore } from '@/lib/store-ai-image-store'
import { isImageStyleId } from '@/lib/store-ai-image-styles'
import { STORE_AI_ERROR_MESSAGES, STORE_AI_HTTP_STATUS, STORE_AI_IMAGE_ERROR_MESSAGES } from '@/lib/store-ai-messages'
import { createStoreAiPort } from '@/lib/store-ai-port'
import { findProhibitedTopic } from '@/lib/store-ai-text'

export const runtime = 'nodejs'
export const maxDuration = 300

type FailureKey = keyof typeof STORE_AI_ERROR_MESSAGES

function fail(error: FailureKey, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    {
      ok: false,
      error,
      message: STORE_AI_IMAGE_ERROR_MESSAGES[error] ?? STORE_AI_ERROR_MESSAGES[error],
      ...extra,
    },
    { status: STORE_AI_HTTP_STATUS[error] },
  )
}

const SOURCE_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg'])

/** The source must be one of THIS project's stored photos; read it from our own bucket only. */
async function readSourceDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return null
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!SOURCE_TYPES.has(type)) return null
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length === 0 || bytes.length > PRODUCT_IMAGE_LIMITS.maxBytes) return null
    return `data:${type};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return fail('invalid_request')

  const { projectId, productKey, requestId, sourceUrl, style } = body
  if (!isUuid(projectId) || !isUuid(productKey) || !isUuid(requestId) || typeof sourceUrl !== 'string') {
    return fail('invalid_request')
  }
  if (!isImageStyleId(style)) return fail('invalid_style')

  let access: Awaited<ReturnType<typeof requireOwnedEcommerceProject>>
  try {
    access = await requireOwnedEcommerceProject(projectId)
  } catch (error) {
    return fail(error instanceof Error && error.message === 'UNAUTHENTICATED' ? 'unauthenticated' : 'not_found')
  }
  if (access.elevated) return fail('admin_not_supported')
  const userId = access.userId

  if (!isOwnProjectImage(sourceUrl, projectId, getProductImageStorageBase())) return fail('source_invalid')

  const productName = typeof body.name === 'string' ? body.name.slice(0, 200) : ''
  if (findProhibitedTopic(productName)) {
    console.info('[store-ai] blocked before charge', { kind: 'image', projectId })
    return fail('forbidden_product')
  }

  // Before the ledger is touched: an unreadable source costs nothing.
  const sourceDataUrl = await readSourceDataUrl(sourceUrl)
  if (!sourceDataUrl) return fail('source_invalid')

  const store = createCandidateStore()
  void sweepExpiredCandidates(store, Date.now(), projectId)

  const port = createStoreAiPort()
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(STORE_AI_IMAGE.timeoutMs)])

  const result = await runMeteredStoreAi(
    port,
    { userId, projectId, productKey, kind: 'image', requestId, signal },
    () =>
      generateImageCandidate(
        { model: generateWithGateway, store, newId: randomUUID },
        { projectId, sourceDataUrl, style, productName, signal },
      ),
  )

  // Ids, kind, outcome, cost only; prompts and images are never logged.
  console.info('[store-ai] image attempt', {
    projectId,
    ok: result.ok,
    outcome: result.ok ? 'succeeded' : result.error,
    charged: result.ok ? result.charged : 0,
    refunded: result.ok ? 0 : result.refunded,
    ...(result.ok
      ? {
          model: STORE_AI_IMAGE.model,
          costUsd: result.value.cost.usd,
          costTry: result.value.cost.try,
          costMeasured: result.value.cost.measured,
          overBreakEven: result.value.cost.overBreakEven,
        }
      : {}),
  })

  if (!result.ok) {
    const code = result.error
    return fail(code, code === 'insufficient_credits' ? { balance: result.balance ?? 0 } : { refunded: result.refunded })
  }

  const status = await readStoreAiStatus(port, userId, projectId, productKey, 'image')
  return NextResponse.json({
    ok: true,
    candidate: { file: result.value.file, url: result.value.url },
    attemptNo: result.attemptNo,
    charged: result.charged,
    balance: status.balance,
    next: status.next,
  })
}
