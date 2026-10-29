import 'server-only'

import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  BILLING_PROFILE_COLUMNS,
  billingProfileRowAsForm,
  type BillingProfileDatabaseRow,
} from '@/lib/billing-profile-store'
import {
  buildPlatformBuyer,
  maskPublicIPv4ForLog,
  resolvePublicClientIp,
  type PlatformBuyer,
} from '@/lib/platform-buyer-shared'
import { BillingProfileIncompleteError } from '@/lib/payments/types'

async function readClientIp(): Promise<string | null> {
  try {
    const resolved = resolvePublicClientIp(await headers())
    if (!resolved) {
      console.warn('[platform-payment] no public buyer IP resolved', {
        header: null,
        maskedIp: null,
      })
      return null
    }

    console.info('[platform-payment] buyer IP resolved', {
      header: resolved.header,
      maskedIp: maskPublicIPv4ForLog(resolved.ip),
    })
    return resolved.ip
  } catch {
    console.warn('[platform-payment] request IP headers unavailable', {
      header: null,
      maskedIp: null,
    })
    return null
  }
}

export type PlatformBuyerProfileStatus = 'complete' | 'incomplete' | 'unavailable'

/**
 * Read-only pre-flight for `resolvePlatformBuyerPublicConfig`: applies the SAME
 * payment-grade checks without needing a client IP and without throwing, so a
 * purchase flow can tell the buyer to finish their invoice profile BEFORE any
 * order row exists. `unavailable` means the profile could not be read; callers
 * must not block on it (the payment step still enforces the check).
 */
export async function checkPlatformBuyerProfile(userId: string): Promise<PlatformBuyerProfileStatus> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('billing_profiles')
      .select(BILLING_PROFILE_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return 'unavailable'
    if (!data) return 'incomplete'
    return buildPlatformBuyer(billingProfileRowAsForm(data as BillingProfileDatabaseRow), null).ok
      ? 'complete'
      : 'incomplete'
  } catch {
    return 'unavailable'
  }
}

/**
 * `publicConfig` for a platform payment, built ONLY from the signed-in user's
 * saved billing profile and the request's real client IP. Throws
 * `BillingProfileIncompleteError` (no PSP call happens) when the profile is
 * missing or fails the payment-grade checks. A missing public IP does not throw
 * here: the live iyzico adapter refuses it with a `PaymentBuyerError('ip')`,
 * while the mock/sandbox paths keep working.
 */
export async function resolvePlatformBuyerPublicConfig(userId: string): Promise<{ buyer: PlatformBuyer }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('billing_profiles')
    .select(BILLING_PROFILE_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new BillingProfileIncompleteError({ customerType: 'required' })

  const result = buildPlatformBuyer(billingProfileRowAsForm(data as BillingProfileDatabaseRow), await readClientIp())
  if (!result.ok) throw new BillingProfileIncompleteError(result.fieldErrors as Record<string, 'required' | 'invalid' | 'too_long'>)
  return { buyer: result.buyer }
}
