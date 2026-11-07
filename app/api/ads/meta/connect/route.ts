import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { resolveMetaAdsOAuthSettings } from '@/lib/ads/env'
import { createGoogleOAuthState, readGoogleOAuthFlowId } from '@/lib/ads/google-oauth-state'
import { buildMetaAuthUrl, META_OAUTH_CALLBACK_COOKIE_PATH, metaOAuthCookieName } from '@/lib/ads/meta-oauth'
import { googleAdsFeatureEnabled, googleAdsJson, googleAdsRedirect, googleAdsRequestAccess, isSameOriginGoogleAdsPost } from '@/lib/ads/google-route-utils'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!googleAdsFeatureEnabled()) return googleAdsJson({ error: 'not_found' }, 404)
  if (!isSameOriginGoogleAdsPost(request)) return googleAdsJson({ error: 'csrf_failed' }, 403)

  const access = await googleAdsRequestAccess()
  const userId = access?.userId ?? null
  if (!userId) return NextResponse.redirect(new URL('/auth/login?next=/ads/dashboard', request.url), 303)
  if (!access?.decision.canConnect) return googleAdsJson({ error: 'not_found' }, 404)

  const rate = checkRateLimit(`meta-ads-connect:${userId}`, 3, 60_000)
  if (!rate.allowed) return googleAdsRedirect(request, { meta: 'rate_limited' })

  const resolved = resolveMetaAdsOAuthSettings()
  if (!resolved.ok) return googleAdsRedirect(request, { meta: resolved.reason })

  const state = createGoogleOAuthState({
    userId,
    flowId: randomUUID(),
    secret: resolved.settings.stateSecret,
  })
  const flowId = readGoogleOAuthFlowId(state.state)
  if (!flowId) return googleAdsRedirect(request, { meta: 'configuration_missing' })

  const authorizationUrl = buildMetaAuthUrl({
    appId: resolved.settings.appId,
    redirectUri: resolved.settings.redirectUri,
    state: state.state,
    loginConfigId: resolved.settings.loginConfigId,
  })

  const response = NextResponse.redirect(authorizationUrl, 303)
  response.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.cookies.set(metaOAuthCookieName(flowId), state.nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: META_OAUTH_CALLBACK_COOKIE_PATH,
    maxAge: 15 * 60,
  })
  return response
}
