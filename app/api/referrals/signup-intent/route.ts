import { NextRequest, NextResponse } from 'next/server'
import {
  REFERRAL_COOKIE_NAME,
  REFERRAL_SIGNUP_INTENT_COOKIE_NAME,
  REFERRAL_SIGNUP_INTENT_TTL_SECONDS,
  isReferralRuntimeReady,
  referralCookieOptions,
} from '@/lib/referrals/core'
import { createSignupIntentForReferral } from '@/lib/referrals/service'

function requestIpAddress(request: NextRequest): string | null {
  const forwarded =
    request.headers.get('x-vercel-forwarded-for') ??
    request.headers.get('x-forwarded-for') ??
    request.headers.get('x-real-ip')
  return forwarded?.split(',')[0]?.trim().slice(0, 128) || null
}

function clearIntentCookie(response: NextResponse) {
  response.cookies.set(REFERRAL_SIGNUP_INTENT_COOKIE_NAME, '', {
    ...referralCookieOptions(0),
    expires: new Date(0),
  })
}

export async function POST(request: NextRequest) {
  const response = new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  })

  if (!isReferralRuntimeReady()) return response

  let source: 'email' | 'oauth' | 'login' | null = null
  try {
    const body = await request.json()
    if (body?.source === 'email' || body?.source === 'oauth' || body?.source === 'login') {
      source = body.source
    }
  } catch {
    return response
  }
  if (!source) return response

  clearIntentCookie(response)
  if (source === 'login') return response

  const intentToken = await createSignupIntentForReferral({
    source,
    referralCookie: request.cookies.get(REFERRAL_COOKIE_NAME)?.value ?? null,
    ipAddress: requestIpAddress(request),
  })
  if (intentToken) {
    response.cookies.set(
      REFERRAL_SIGNUP_INTENT_COOKIE_NAME,
      intentToken,
      referralCookieOptions(REFERRAL_SIGNUP_INTENT_TTL_SECONDS),
    )
  }

  return response
}
