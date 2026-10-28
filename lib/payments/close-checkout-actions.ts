'use server'

import { createClient } from '@/lib/supabase/server'
import { clampSince } from '@/lib/payment-notice'
import type { CloseOutcome } from './reconcile'
import { closePendingCheckoutForUser } from './reconcile-store'

/**
 * Called when the buyer closes the payment window while the iyzico step is
 * showing. Acts only on the signed-in user's own newest pending checkout
 * started at/after `sinceMs`; see `closePendingCheckoutForUser`.
 */
export async function closePendingCheckout(sinceMs: number): Promise<CloseOutcome> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'none'
  return closePendingCheckoutForUser(user.id, clampSince(Number(sinceMs), Date.now()))
}
