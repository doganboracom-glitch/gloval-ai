import type { createAdminClient } from '@/lib/supabase/admin'
import {
  applyStorePaymentWebhook,
  type StoreWebhookDeps,
  type StoreWebhookOutcome,
} from '@/lib/store-webhook-handler'
import {
  parsePaytrCallbackBody,
  verifyCallbackHash,
  type PaytrCredentials,
} from '@/lib/store-payments/paytr-core'

type Admin = ReturnType<typeof createAdminClient>

export const PAYTR_WEBHOOK_MAX_BYTES = 16 * 1024

export type PaytrWebhookOutcome =
  | { outcome: 'invalid_payload' }
  | { outcome: 'no_credentials' }
  | { outcome: 'bad_hash' }
  | { outcome: 'order_not_found' }
  | StoreWebhookOutcome

/**
 * Processes one PayTR server-to-server callback for ONE store. The caller
 * always answers PayTR with plain `OK`; this function decides whether the
 * order may change. Nothing changes unless the hash verifies against THIS
 * store's Merchant Key/Salt and the order belongs to this store.
 *
 * Callbacks are located by `merchant_oid` (= payment_ref) + provider + project,
 * so another store's order id (even with a valid signature from that store's
 * own keys) can never settle this one.
 */
export async function processPaytrCallback(
  admin: Admin,
  projectId: string,
  rawBody: string,
  loadCredentials: (projectId: string) => Promise<PaytrCredentials | null>,
  deps: StoreWebhookDeps,
): Promise<PaytrWebhookOutcome> {
  const callback = parsePaytrCallbackBody(rawBody)
  if (!callback) return { outcome: 'invalid_payload' }

  let credentials: PaytrCredentials | null
  try {
    credentials = await loadCredentials(projectId)
  } catch {
    credentials = null
  }
  if (!credentials) return { outcome: 'no_credentials' }

  if (
    !verifyCallbackHash(
      {
        merchantOid: callback.merchantOid,
        status: callback.status,
        totalAmount: callback.totalAmount,
        hash: callback.hash,
      },
      credentials.merchantSalt,
      credentials.merchantKey,
    )
  ) {
    return { outcome: 'bad_hash' }
  }

  const result =
    callback.status === 'success'
      ? {
          reference: callback.merchantOid,
          status: 'paid' as const,
          paidAmountCents: Number(callback.totalAmount),
          // The signed total may include an installment surcharge.
          amountMatch: 'at_least' as const,
        }
      : { reference: callback.merchantOid, status: 'failed' as const }

  return applyStorePaymentWebhook(admin, 'paytr', result, deps, { projectId })
}
