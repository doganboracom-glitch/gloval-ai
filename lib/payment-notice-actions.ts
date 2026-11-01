'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser, authUnavailableActionResult, type AuthUnavailableActionResult } from '@/lib/supabase/request-user'
import { clampSince, decidePaymentOutcome, type OutcomeRow, type PaymentOutcome } from '@/lib/payment-notice'

/**
 * Read-only: reports how the signed-in user's latest checkout started at/after
 * `sinceMs` ended. Used when the provider page ran in another tab and the
 * postMessage never reached this one. It only reads the user's own rows and
 * never changes any state.
 */
export async function getPaymentOutcomeSince(
  sinceMs: number,
): Promise<PaymentOutcome | AuthUnavailableActionResult> {
  const authState = await getRequestUser()
  if (authState.kind === 'unavailable') return authUnavailableActionResult()
  if (authState.kind === 'unauthenticated') return 'none'
  const user = authState.user

  const sinceIso = new Date(clampSince(Number(sinceMs), Date.now())).toISOString()
  const admin = createAdminClient()

  const [txns, addons] = await Promise.all([
    admin
      .from('billing_transactions')
      .select('created_at, status')
      .eq('user_id', user.id)
      .eq('kind', 'charge')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(10),
    admin
      .from('addon_purchases')
      .select('created_at, status')
      .eq('user_id', user.id)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (txns.error || addons.error) return 'none'
  const rows: OutcomeRow[] = [...(txns.data ?? []), ...(addons.data ?? [])]
  return decidePaymentOutcome(rows)
}
