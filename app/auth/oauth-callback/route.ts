import { createClient } from '@/lib/supabase/server'
import { scheduleWelcomeEmail } from '@/lib/email-outbox'
import { sanitizeNextPath } from '@/lib/safe-redirect'
import {
  REFERRAL_COOKIE_NAME,
  REFERRAL_SIGNUP_INTENT_COOKIE_NAME,
  referralCookieOptions,
} from '@/lib/referrals/core'
import { saveOAuthReferralAtSignup } from '@/lib/referrals/service'
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from '@/lib/attribution'
import { saveSignupAttribution } from '@/lib/signup-attribution'
import { newEventNonce } from '@/lib/analytics/event-ids'
import {
  OAUTH_SIGNUP_EVENT_PARAM,
  OAUTH_SIGNUP_FLOW_PARAM,
  PENDING_OAUTH_SIGNUP_COOKIE,
} from '@/lib/analytics-events'
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
  response.cookies.set(PENDING_OAUTH_SIGNUP_COOKIE, '', {
    httpOnly: false,
    secure: new URL(url).protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  })
  return response
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

  const code = searchParams.get('code')
  const next = sanitizeNextPath(searchParams.get('next'))
  const signupFlow = searchParams.get(OAUTH_SIGNUP_FLOW_PARAM) === '1'
  const signupStartedAt = Number(request.cookies.get(PENDING_OAUTH_SIGNUP_COOKIE)?.value)

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

  const now = Date.now()
  const userCreatedAt = data.user?.created_at ? Date.parse(data.user.created_at) : NaN
  const isNewSignup =
    signupFlow &&
    Number.isFinite(signupStartedAt) &&
    signupStartedAt > 0 &&
    signupStartedAt <= now + 60_000 &&
    now - signupStartedAt <= 10 * 60_000 &&
    Number.isFinite(userCreatedAt) &&
    userCreatedAt >= signupStartedAt - 60_000 &&
    userCreatedAt <= now + 60_000

  if (isNewSignup && data.user?.id) {
    const attribution = parseAttributionCookie(request.cookies.get(ATTRIBUTION_COOKIE)?.value)
    if (attribution) {
      try {
        await saveSignupAttribution({ userId: data.user.id, attribution })
      } catch {
        // Attribution must never block OAuth completion.
      }
    }
  }

  scheduleWelcomeEmail(data?.user)

  const destination = new URL(`${origin}${next}`)
  if (isNewSignup) destination.searchParams.set(OAUTH_SIGNUP_EVENT_PARAM, newEventNonce())
  return redirectAndClearSignupIntent(destination.toString())
}
