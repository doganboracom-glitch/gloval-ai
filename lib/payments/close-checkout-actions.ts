'use server'

import { getRequestUser, authUnavailableActionResult, type AuthUnavailableActionResult } from '@/lib/supabase/request-user'
import { clampSince } from '@/lib/payment-notice'
import type { CloseOutcome } from './reconcile'
import { closePendingCheckoutForUser } from './reconcile-store'

/**
 * Called when the buyer closes the payment window while the iyzico step is
 * showing. Acts only on the signed-in user's own newest pending checkout
 * started at/after `sinceMs`; see `closePendingCheckoutForUser`.
 */
export async function closePendingCheckout(
  sinceMs: number,
): Promise<CloseOutcome | AuthUnavailableActionResult> {
  const authState = await getRequestUser()
  if (authState.kind === 'unavailable') return authUnavailableActionResult()
  if (authState.kind === 'unauthenticated') return 'none'
  return closePendingCheckoutForUser(authState.user.id, clampSince(Number(sinceMs), Date.now()))
}
