import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import {
  getTenantSlugFromHost,
  getPlatformRedirectUrl,
  isForeignHost,
  isTenantPassthroughPath,
} from '@/lib/domains'
import {
  getPublishedSlugForProjectId,
  resolveActiveDomainForHost,
} from '@/lib/custom-domains/service'
import { tenantRewritePath } from '@/lib/indexnow'
import { LANG_COOKIE, normalizeLang, resolveLangFromAcceptLanguage } from '@/lib/i18n'
import { clearVerifiedUserHeaders } from '@/lib/supabase/auth-context'
import {
  REFERRAL_COOKIE_NAME,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  isReferralRuntimeReady,
  referralCookieOptions,
} from '@/lib/referrals/core'
import { captureReferralClick } from '@/lib/referrals/service'

const LEGACY_TENANT_REFUND_PATH = '/yasal/iptal-ve-iade'

function redirectLegacyRefundPath(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = '/yasal/teslimat-ve-iade'
  return NextResponse.redirect(url, 308)
}

function createSanitizedRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers)
  clearVerifiedUserHeaders(headers)
  return headers
}

function nextWithSanitizedRequestHeaders(request: NextRequest): NextResponse {
  return NextResponse.next({
    request: { headers: createSanitizedRequestHeaders(request) },
  })
}

function rewriteWithSanitizedRequestHeaders(
  request: NextRequest,
  destination: URL,
): NextResponse {
  return NextResponse.rewrite(destination, {
    request: { headers: createSanitizedRequestHeaders(request) },
  })
}

function isReferralExcludedPath(pathname: string): boolean {
  return ['/auth', '/api', '/admin', '/site'].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

function requestIpAddress(request: NextRequest): string | null {
  const forwarded =
    request.headers.get('x-vercel-forwarded-for') ??
    request.headers.get('x-forwarded-for') ??
    request.headers.get('x-real-ip')
  return forwarded?.split(',')[0]?.trim().slice(0, 128) || null
}

function redirectWithResponseCookies(
  response: NextResponse,
  destination: URL,
  status: number,
): NextResponse {
  const redirect = NextResponse.redirect(destination, status)
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
  return redirect
}

export async function middleware(request: NextRequest) {
  clearVerifiedUserHeaders(request.headers)
  const host = request.headers.get('host')

  // 1) Wildcard tenant subdomains: `<slug>.gloval.site` is served by the
  // existing `/site/[slug]` routes via an internal rewrite (the URL stays on
  // the subdomain).
  const slug = getTenantSlugFromHost(host)
  if (slug && isTenantPassthroughPath(request.nextUrl.pathname)) {
    return nextWithSanitizedRequestHeaders(request)
  }
  if (slug && request.nextUrl.pathname === LEGACY_TENANT_REFUND_PATH) {
    return redirectLegacyRefundPath(request)
  }
  if (slug && !request.nextUrl.pathname.startsWith('/site/')) {
    const url = request.nextUrl.clone()
    url.pathname = tenantRewritePath(slug, request.nextUrl.pathname)
    return rewriteWithSanitizedRequestHeaders(request, url)
  }

  // 1.5) Bring-your-own custom domains: a customer domain that has passed
  // verification AND been explicitly bound to a published site (via
  // `bindMyDomainWebsite`) renders that same site through the existing
  // `/site/[slug]` routes, just like a `*.gloval.site` subdomain. `isForeignHost`
  // is only a cheap pre-filter so this lookup never runs for the platform's own
  // hosts or local/preview dev; the real access decision is
  // `resolveActiveDomainForHost` requiring `active` + a bound project, and
  // `getPublishedSlugForProjectId` requiring that project still be published.
  if (host && !slug && !request.nextUrl.pathname.startsWith('/site/') && isForeignHost(host)) {
    if (isTenantPassthroughPath(request.nextUrl.pathname)) return nextWithSanitizedRequestHeaders(request)
    if (request.nextUrl.pathname === LEGACY_TENANT_REFUND_PATH) return redirectLegacyRefundPath(request)
    const bound = await resolveActiveDomainForHost(host)
    const targetSlug = bound?.websiteProjectId
      ? await getPublishedSlugForProjectId(bound.websiteProjectId)
      : null
    if (targetSlug) {
      const url = request.nextUrl.clone()
      url.pathname = tenantRewritePath(targetSlug, request.nextUrl.pathname)
      return rewriteWithSanitizedRequestHeaders(request, url)
    }
  }

  // 2) Fold aliases into the canonical platform host: www.gloval.ai,
  // gloval.site and www.gloval.site all 308-redirect to https://gloval.ai
  // (path + query kept).
  const redirectUrl = getPlatformRedirectUrl(
    host,
    request.nextUrl.pathname + request.nextUrl.search,
  )
  if (redirectUrl) {
    return NextResponse.redirect(redirectUrl, 308)
  }

  // 3) Canonical platform host (gloval.ai / previews / localhost): resolve
  // the visitor's language for this request, then run the normal auth flow.
  const { renderLang, persist } = resolveLanguage(request)
  // Mutating request.cookies here (before updateSession forwards the request
  // headers) makes the resolved value visible to Server Components via
  // cookies() on this very request — critical for a first-time visitor who
  // has no language cookie yet.
  request.cookies.set(LANG_COOKIE, renderLang)

  const response = await updateSession(request)

  // Only write the cookie back to the browser when we're actually
  // establishing/changing the stored preference. A manual switcher pick and
  // an already-stored preference are left untouched here.
  if (persist) {
    response.cookies.set(LANG_COOKIE, renderLang, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
  }

  const referralValues = request.nextUrl.searchParams.getAll('ref')
  if (
    request.method === 'GET' &&
    referralValues.length > 0 &&
    isReferralRuntimeReady() &&
    !isReferralExcludedPath(request.nextUrl.pathname) &&
    (!host || !isForeignHost(host))
  ) {
    const capture = await captureReferralClick({
      code: referralValues.length === 1 ? referralValues[0] : null,
      existingCookie: request.cookies.get(REFERRAL_COOKIE_NAME)?.value ?? null,
      ipAddress: requestIpAddress(request),
    })

    if (capture.handled) {
      const location = response.headers.get('location')
      if (!location && response.status >= 400) {
        if (capture.cookieToken) {
          response.cookies.set(
            REFERRAL_COOKIE_NAME,
            capture.cookieToken,
            referralCookieOptions(REFERRAL_COOKIE_MAX_AGE_SECONDS),
          )
        }
        return response
      }

      const destination = location
        ? new URL(location, request.url)
        : request.nextUrl.clone()
      destination.searchParams.delete('ref')
      if (destination.origin !== request.nextUrl.origin) return response

      const cleanResponse = redirectWithResponseCookies(
        response,
        destination,
        location ? response.status : 307,
      )
      if (capture.cookieToken) {
        cleanResponse.cookies.set(
          REFERRAL_COOKIE_NAME,
          capture.cookieToken,
          referralCookieOptions(REFERRAL_COOKIE_MAX_AGE_SECONDS),
        )
      }
      return cleanResponse
    }
  }

  return response
}

/**
 * Decides which language to render for this request and whether that
 * decision should be persisted as the visitor's stored preference.
 *
 * Priority: explicit `?lang=` query param > existing preference cookie >
 * browser `Accept-Language` > default. An explicit `?lang=` always wins for
 * THIS render (e.g. a shared marketing link), but only becomes the stored
 * preference if the visitor didn't already have one — a deliberate manual
 * choice (made via the in-app language switcher, which sets its own cookie)
 * must never be silently overwritten by a stray link.
 */
function resolveLanguage(request: NextRequest) {
  const existing = normalizeLang(request.cookies.get(LANG_COOKIE)?.value)
  const explicit = normalizeLang(request.nextUrl.searchParams.get('lang'))

  if (explicit) {
    return { renderLang: explicit, persist: !existing }
  }
  if (existing) {
    return { renderLang: existing, persist: false }
  }
  return {
    renderLang: resolveLangFromAcceptLanguage(request.headers.get('accept-language')),
    persist: true,
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images / public assets
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
