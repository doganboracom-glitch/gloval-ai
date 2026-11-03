import { createClient } from '@/lib/supabase/server'
import { scheduleWelcomeEmail } from '@/lib/email-outbox'
import { sanitizeNextPath } from '@/lib/safe-redirect'
import {
  REFERRAL_COOKIE_NAME,
  REFERRAL_SIGNUP_INTENT_COOKIE_NAME,
  referralCookieOptions,
} from '@/lib/referrals/core'
import { saveOAuthReferralAtSignup } from '@/lib/referrals/service'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Callback for Google social sign-in.
 *
 * This is intentionally a SEPARATE route from `/auth/callback`. Both an
 * OAuth authorization and an email confirmation link resolve through the
 * same Supabase PKCE `?code=` shape, but they need different endings:
 * email confirmation must NOT leave the visitor signed in (see
 * `/auth/callback`'s comment), while a social login must. Keeping them
 * split avoids touching that existing, already-correct email flow.
 */
function redirectAndClearSignupIntent(url: string): NextResponse {
  const response = NextResponse.redirect(url)
  response.cookies.set(REFERRAL_SIGNUP_INTENT_COOKIE_NAME, '', {
    ...referralCookieOptions(0),
    expires: new Date(0),
  })
  return response
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

  const code = searchParams.get('code')
  const next = sanitizeNextPath(searchParams.get('next'))

  if (!code) {
    return redirectAndClearSignupIntent(`${origin}/auth/login?error=oauth`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return redirectAndClearSignupIntent(`${origin}/auth/login?error=oauth`)
  }

  if (data.user?.id) {
    await saveOAuthReferralAtSignup({
      userId: data.user.id,
      userCreatedAt: data.user.created_at,
      intentToken: request.cookies.get(REFERRAL_SIGNUP_INTENT_COOKIE_NAME)?.value ?? null,
      referralCookie: request.cookies.get(REFERRAL_COOKIE_NAME)?.value ?? null,
    })
  }

  scheduleWelcomeEmail(data?.user)

  return redirectAndClearSignupIntent(`${origin}${next}`)
}
