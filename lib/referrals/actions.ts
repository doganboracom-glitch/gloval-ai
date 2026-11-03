'use server'

import { cookies } from 'next/headers'
import {
  REFERRAL_COOKIE_NAME,
  REFERRAL_SIGNUP_INTENT_COOKIE_NAME,
} from '@/lib/referrals/core'
import { saveEmailReferralAtSignup } from '@/lib/referrals/service'

export async function saveEmailReferralAction(input: { userId: string }): Promise<void> {
  try {
    const cookieStore = await cookies()
    await saveEmailReferralAtSignup({
      userId: input.userId,
      intentToken: cookieStore.get(REFERRAL_SIGNUP_INTENT_COOKIE_NAME)?.value ?? null,
      referralCookie: cookieStore.get(REFERRAL_COOKIE_NAME)?.value ?? null,
    })
    cookieStore.delete(REFERRAL_SIGNUP_INTENT_COOKIE_NAME)
  } catch {
    // Referral capture must never turn an otherwise successful signup into a failure.
  }
}
