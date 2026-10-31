import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  ADS_ANON_COOKIE,
  ADS_ANON_COOKIE_MAX_AGE_SECONDS,
  ADS_ANON_COOKIE_PATH,
  issueAnonCookie,
  verifyAnonCookie,
} from '@/lib/ads/anon-identity'
import { isAdsFeatureUiEnabled } from '@/lib/ads/feature-flag'

export const dynamic = 'force-dynamic'

/**
 * Issues the anonymous visitor cookie when the /ads page loads, so the first
 * form submission already carries a cookie that is older than the request.
 * Safe to call repeatedly: a valid cookie is kept as it is.
 */
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' }
  if (!isAdsFeatureUiEnabled()) return NextResponse.json({ ok: false }, { status: 404, headers })

  const jar = await cookies()
  const current = verifyAnonCookie(jar.get(ADS_ANON_COOKIE)?.value)
  if (current.status === 'unconfigured') {
    return NextResponse.json({ ok: false, code: 'service_unavailable' }, { status: 503, headers })
  }
  if (current.status === 'valid') return NextResponse.json({ ok: true }, { headers })

  const issued = issueAnonCookie()
  if (!issued) return NextResponse.json({ ok: false, code: 'service_unavailable' }, { status: 503, headers })

  const response = NextResponse.json({ ok: true }, { headers })
  response.cookies.set(ADS_ANON_COOKIE, issued.value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: ADS_ANON_COOKIE_PATH,
    maxAge: ADS_ANON_COOKIE_MAX_AGE_SECONDS,
  })
  return response
}
