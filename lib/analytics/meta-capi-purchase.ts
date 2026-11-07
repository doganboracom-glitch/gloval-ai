import { createAdminClient } from '@/lib/supabase/admin'
import { metaEventIds } from '@/lib/analytics/event-ids'
import {
  runInBackground,
  sendMetaCapiEvent,
  type MetaCapiContext,
  type MetaCapiUser,
} from '@/lib/analytics/meta-capi'

export type VerifiedPurchase = {
  /** Same ID the browser receives as `gl_tx` and uses for Pixel `eventID`. */
  id: string
  value: number
  currency: string
  kind: string
}

/** Auth profile of a user for CAPI matching. Never throws; failure means no profile. */
export async function loadCapiUser(userId: string): Promise<MetaCapiUser | undefined> {
  try {
    const { data, error } = await createAdminClient().auth.admin.getUserById(userId)
    if (error || !data.user) return undefined
    return { userId: data.user.id, email: data.user.email, phone: data.user.phone }
  } catch {
    return undefined
  }
}

async function findBuyerId(reference: string): Promise<string | undefined> {
  try {
    const { data } = await createAdminClient()
      .from('billing_transactions')
      .select('user_id')
      .eq('provider_ref', reference)
      .maybeSingle()
    return typeof data?.user_id === 'string' ? data.user_id : undefined
  } catch {
    return undefined
  }
}

/**
 * Sends the Purchase for a payment that iyzico's retrieve API confirmed AND
 * `settlePaymentResult` settled. The caller passes only that authoritative
 * data; the event ID is `purchase:<orderRef>`, so a replayed callback re-sends
 * the same ID and Meta counts the order once.
 */
export async function sendVerifiedPurchase(
  purchase: VerifiedPurchase,
  reference: string,
  context: MetaCapiContext,
) {
  if (!context.marketingConsent) return { sent: false as const, reason: 'no_consent' as const }
  const buyerId = await findBuyerId(reference)
  const user = buyerId ? await loadCapiUser(buyerId) : undefined
  return sendMetaCapiEvent({
    name: 'Purchase',
    eventId: metaEventIds.purchase(purchase.id),
    context,
    user,
    custom: {
      value: purchase.value,
      currency: purchase.currency,
      content_type: 'product',
      content_category: purchase.kind,
    },
  })
}

/** Schedules the Purchase after the callback response; never delays or breaks it. */
export function dispatchVerifiedPurchase(
  purchase: VerifiedPurchase | undefined,
  reference: string,
  context: MetaCapiContext,
): void {
  if (!purchase) return
  runInBackground(() => sendVerifiedPurchase(purchase, reference, context))
}
