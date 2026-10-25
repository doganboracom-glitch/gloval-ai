import { rejectAnonymous } from '@/lib/api-auth'
import { NextResponse } from 'next/server'
import { resolveAiModel } from '@/lib/ai-models'
import { getPlanCodeForUser } from '@/lib/billing'
import { listCategories } from '@/lib/ecommerce'
import { requireOwnedEcommerceProject } from '@/lib/ecommerce-access'
import { getProductImageStorageBase } from '@/lib/product-image-store'
import { isOwnProjectImage, isUuid } from '@/lib/product-images'
import { PRODUCT_LIMITS } from '@/lib/product-input'
import { STORE_AI_MODEL_TIMEOUT_MS } from '@/lib/store-ai-constants'
import { readStoreAiStatus, runMeteredStoreAi } from '@/lib/store-ai-engine'
import { STORE_AI_ERROR_MESSAGES, STORE_AI_HTTP_STATUS } from '@/lib/store-ai-messages'
import { createStoreAiPort } from '@/lib/store-ai-port'
import {
  STORE_AI_MAX_IMAGES,
  findProhibitedTopic,
  generateStoreAiText,
  hasUsableInput,
  type StoreAiTextInput,
} from '@/lib/store-ai-text'

export const runtime = 'nodejs'
export const maxDuration = 60

type FailureKey = keyof typeof STORE_AI_ERROR_MESSAGES

function fail(error: FailureKey, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { ok: false, error, message: STORE_AI_ERROR_MESSAGES[error], ...extra },
    { status: STORE_AI_HTTP_STATUS[error] },
  )
}

function asString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function parseSpecs(value: unknown): StoreAiTextInput['specs'] {
  if (!Array.isArray(value)) return []
  return value.slice(0, PRODUCT_LIMITS.specCount).map((item) => {
    const spec = (item ?? {}) as { name?: unknown; value?: unknown }
    return { name: asString(spec.name, PRODUCT_LIMITS.specName), value: asString(spec.value, PRODUCT_LIMITS.specValue) }
  })
}

export async function POST(request: Request) {
  const anonymous = await rejectAnonymous()
  if (anonymous) return anonymous

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return fail('invalid_request')

  const { projectId, productKey, requestId } = body
  if (!isUuid(projectId) || !isUuid(productKey) || !isUuid(requestId)) return fail('invalid_request')

  let access: Awaited<ReturnType<typeof requireOwnedEcommerceProject>>
  try {
    access = await requireOwnedEcommerceProject(projectId)
  } catch (error) {
    return fail(error instanceof Error && error.message === 'UNAUTHENTICATED' ? 'unauthenticated' : 'not_found')
  }
  if (access.elevated) return fail('admin_not_supported')
  const userId = access.userId

  const storageBase = getProductImageStorageBase()
  const rawUrls = Array.isArray(body.imageUrls) ? body.imageUrls : []
  const imageUrls = rawUrls
    .filter((url): url is string => typeof url === 'string' && isOwnProjectImage(url, projectId, storageBase))
    .slice(0, STORE_AI_MAX_IMAGES)

  const categories = (await listCategories(projectId)).map((category) => ({ id: category.id, name: category.name }))
  const input: StoreAiTextInput = {
    name: asString(body.name, 200),
    categoryId: typeof body.categoryId === 'string' ? body.categoryId : null,
    categories,
    specs: parseSpecs(body.specs),
    imageUrls,
    lang: body.lang === 'en' ? 'en' : 'tr',
  }

  if (!hasUsableInput(input)) return fail('no_input')

  const categoryName = categories.find((c) => c.id === input.categoryId)?.name
  const prohibited = findProhibitedTopic(
    input.name,
    categoryName,
    ...input.specs.flatMap((s) => [s.name, s.value]),
  )
  if (prohibited) {
    // Refused before the ledger is touched: nothing to charge or refund.
    console.info('[store-ai] blocked before charge', { kind: 'text', projectId })
    return fail('forbidden_product')
  }

  const port = createStoreAiPort()
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(STORE_AI_MODEL_TIMEOUT_MS)])

  const ai = resolveAiModel('productText', await getPlanCodeForUser(userId))

  const result = await runMeteredStoreAi(
    port,
    { userId, projectId, productKey, kind: 'text', requestId, signal },
    () => generateStoreAiText(input, signal, undefined, ai.model, ai.plan),
  )

  // Ids, kind, outcome and cost only; prompts and generated text are never logged.
  console.info('[store-ai] text attempt', {
    projectId,
    ok: result.ok,
    outcome: result.ok ? 'succeeded' : result.error,
    charged: result.ok ? result.charged : 0,
    refunded: result.ok ? 0 : result.refunded,
  })

  if (!result.ok) {
    const code = result.error
    return fail(code, code === 'insufficient_credits' ? { balance: result.balance ?? 0 } : { refunded: result.refunded })
  }

  const status = await readStoreAiStatus(port, userId, projectId, productKey, 'text')
  return NextResponse.json({
    ok: true,
    result: result.value,
    attemptNo: result.attemptNo,
    charged: result.charged,
    balance: status.balance,
    next: status.next,
  })
}
