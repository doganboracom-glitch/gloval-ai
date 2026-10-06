import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { getTenantSlugFromHost, getPlatformRedirectUrl, isForeignHost } from '@/lib/domains'
import {
  getPublishedSlugForProjectId,
  resolveActiveDomainForHost,
} from '@/lib/custom-domains/service'
import { LANG_COOKIE, normalizeLang, resolveLangFromAcceptLanguage } from '@/lib/i18n'

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host')

  // 1) Wildcard tenant subdomains: `<slug>.gloval.site` is served by the
  // existing `/site/[slug]` routes via an internal rewrite (the URL stays on
  // the subdomain).
  const slug = getTenantSlugFromHost(host)
  if (slug && !request.nextUrl.pathname.startsWith('/site/')) {
    const url = request.nextUrl.clone()
    const rest = request.nextUrl.pathname === '/' ? '' : request.nextUrl.pathname
    url.pathname = `/site/${slug}${rest}`
    return NextResponse.rewrite(url)
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
    const bound = await resolveActiveDomainForHost(host)
    const targetSlug = bound?.websiteProjectId
      ? await getPublishedSlugForProjectId(bound.websiteProjectId)
      : null
    if (targetSlug) {
      const url = request.nextUrl.clone()
      const rest = request.nextUrl.pathname === '/' ? '' : request.nextUrl.pathname
      url.pathname = `/site/${targetSlug}${rest}`
      return NextResponse.rewrite(url)
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
  // Mutating request.cookies here (before updateSession creates its
  // NextResponse.next({ request })) makes the resolved value visible to
  // Server Components via cookies() on this very request — critical for a
  // first-time visitor who has no language cookie yet.
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
