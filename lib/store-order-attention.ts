import type { createAdminClient } from '@/lib/supabase/admin'
import { isMissingColumnError } from '@/lib/store-schema-compat'

type Admin = ReturnType<typeof createAdminClient>

/** Failed settle attempts after which a paid-at-the-provider order is flagged. */
export const MAX_SETTLE_ATTEMPTS = 3

/**
 * The only values ever stored in `attention_reason`: short step codes, never
 * personal data, order contents or raw error bodies.
 */
export const ATTENTION_REASON_CODES = [
  'lookup',
  'mark_paid',
  'take_stock',
  'mark_failed',
  'release_stock',
  'mark_refunded',
  'unknown',
] as const
export type AttentionReasonCode = (typeof ATTENTION_REASON_CODES)[number]

export function toAttentionReason(step: unknown): AttentionReasonCode {
  return (ATTENTION_REASON_CODES as readonly unknown[]).includes(step) ? (step as AttentionReasonCode) : 'unknown'
}

export type AttentionDeps = {
  /** Sends the one-time owner e-mail. Must be safe to call twice (deduped by the sender). */
  notifyAttention: (orderId: string) => void | Promise<void>
}

export type SettleFailureResult =
  | { recorded: false; reason: 'unsupported' | 'error' }
  | { recorded: true; attempts: number; escalated: boolean }

/**
 * The provider confirmed the payment but a database step (status or stock)
 * failed. Counts the failure and, from the Nth one on, flags the order so it
 * cannot be lost: the owner sees it and is told once. The order itself stays
 * pending, so the reconciliation keeps retrying it.
 *
 * Returns `unsupported` while scripts/053 is not applied; the order is then
 * simply retried as before.
 */
export async function recordSettleFailure(
  admin: Admin,
  input: { orderId: string; projectId: string; step: AttentionReasonCode },
  deps: AttentionDeps,
): Promise<SettleFailureResult> {
  const { data: row, error: readError } = await admin
    .from('ecommerce_orders')
    .select('settle_attempts, attention_at')
    .eq('id', input.orderId)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (isMissingColumnError(readError)) return { recorded: false, reason: 'unsupported' }
  if (readError || !row) {
    console.error('[store-attention] attempt read failed', { orderId: input.orderId, code: readError?.code })
    return { recorded: false, reason: 'error' }
  }

  const attempts = (Number((row as { settle_attempts?: number | null }).settle_attempts) || 0) + 1
  const alreadyFlagged = Boolean((row as { attention_at?: string | null }).attention_at)
  const escalate = attempts >= MAX_SETTLE_ATTEMPTS && !alreadyFlagged

  const patch: Record<string, unknown> = { settle_attempts: attempts }
  if (escalate) {
    patch.attention_at = new Date().toISOString()
    patch.attention_reason = toAttentionReason(input.step)
  }
  const { error: writeError } = await admin
    .from('ecommerce_orders')
    .update(patch)
    .eq('id', input.orderId)
    .eq('project_id', input.projectId)
  if (writeError) {
    console.error('[store-attention] attempt write failed', { orderId: input.orderId, code: writeError.code })
    return { recorded: false, reason: 'error' }
  }

  if (escalate) {
    console.error('[store-attention] paid order could not be completed', {
      orderId: input.orderId,
      step: input.step,
      attempts,
    })
    try {
      await deps.notifyAttention(input.orderId)
    } catch (err) {
      console.error('[store-attention] owner notification failed', {
        orderId: input.orderId,
        message: err instanceof Error ? err.message : 'unknown',
      })
    }
  }
  return { recorded: true, attempts, escalated: escalate }
}

/** Removes the flag once the order completed (best effort; the display also checks the order state). */
export async function clearOrderAttention(admin: Admin, orderId: string): Promise<void> {
  const { error } = await admin
    .from('ecommerce_orders')
    .update({ attention_at: null, attention_reason: null, settle_attempts: 0 })
    .eq('id', orderId)
  if (error && !isMissingColumnError(error)) {
    console.error('[store-attention] clear failed', { orderId, code: error.code })
  }
}

/** A flagged order is only "needs attention" while it is still unfinished. */
export function needsAttention(order: {
  attention_at?: string | null
  status: string
  payment_status: string
}): boolean {
  return (
    Boolean(order.attention_at) &&
    order.status === 'pending' &&
    order.payment_status === 'pending'
  )
}
