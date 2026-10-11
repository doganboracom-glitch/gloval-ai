'use server'

import { requireOwnedEcommerceProject } from '@/lib/ecommerce-access'
import { isUuid } from '@/lib/product-images'
import type { StoreAiKind, StoreAiNextAttempt } from '@/lib/store-ai-constants'
import { authorizeProductKey, readStoreAiStatus } from '@/lib/store-ai-engine'
import { createStoreAiPort } from '@/lib/store-ai-port'

export type StoreAiStatusResult =
  | { ok: true; balance: number; next: StoreAiNextAttempt; canAfford: boolean }
  | { ok: false }

async function authorize(projectId: string, productKey: string) {
  if (!isUuid(projectId) || !isUuid(productKey)) return null
  try {
    const access = await requireOwnedEcommerceProject(projectId)
    if (access.elevated) return null
    const port = createStoreAiPort()
    if (!(await authorizeProductKey(port, projectId, productKey))) return null
    return { port, userId: access.userId }
  } catch {
    return null
  }
}

/** Balance and the price of the NEXT attempt, shown on the button before the click. */
export async function getStoreAiStatus(
  projectId: string,
  productKey: string,
  kind: StoreAiKind = 'text',
): Promise<StoreAiStatusResult> {
  const ctx = await authorize(projectId, productKey)
  if (!ctx) return { ok: false }
  try {
    return { ok: true, ...(await readStoreAiStatus(ctx.port, ctx.userId, projectId, productKey, kind)) }
  } catch {
    return { ok: false }
  }
}

/** The owner applied a result ("Kullan"): the retry series starts over, next attempt is paid. */
export async function markStoreAiApplied(
  projectId: string,
  productKey: string,
  kind: StoreAiKind = 'text',
): Promise<StoreAiStatusResult> {
  const ctx = await authorize(projectId, productKey)
  if (!ctx) return { ok: false }
  try {
    await ctx.port.resetSeries(projectId, productKey, kind)
    return { ok: true, ...(await readStoreAiStatus(ctx.port, ctx.userId, projectId, productKey, kind)) }
  } catch {
    return { ok: false }
  }
}
