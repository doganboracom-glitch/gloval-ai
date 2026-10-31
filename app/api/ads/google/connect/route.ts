import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAdsTokenKeyring, encryptAdsToken } from '@/lib/ads/token-crypto'
import { createGoogleAdsProvider } from '@/lib/ads/providers/google-ads-provider'
import { GOOGLE_OAUTH_CALLBACK_COOKIE_PATH, createGoogleOAuthState, createGooglePkcePair, googleOAuthCookieName, hashGoogleOAuthState } from '@/lib/ads/google-oauth-state'
import { googleOAuthTokenContext } from '@/lib/ads/google-connections'
import { resolveGoogleAdsOAuthSettings } from '@/lib/ads/env'
import { googleAdsConnectAllowed, googleAdsFeatureEnabled, googleAdsJson, googleAdsRedirect, googleAdsUserId, isSameOriginGoogleAdsPost } from '@/lib/ads/google-route-utils'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!googleAdsFeatureEnabled()) return googleAdsJson({ error: 'not_found' }, 404)
  if (!isSameOriginGoogleAdsPost(request)) return googleAdsJson({ error: 'csrf_failed' }, 403)

  const userId = await googleAdsUserId()
  if (!userId) return NextResponse.redirect(new URL('/auth/login?next=/ads/dashboard', request.url), 303)
  if (!googleAdsConnectAllowed(userId)) return googleAdsJson({ error: 'not_found' }, 404)

  const rate = checkRateLimit(`google-ads-connect:${userId}`, 3, 60_000)
  if (!rate.allowed) return googleAdsRedirect(request, { google: 'rate_limited' })

  const resolved = resolveGoogleAdsOAuthSettings()
  if (!resolved.ok) return googleAdsRedirect(request, { google: resolved.reason })

  let keyring
  try {
    keyring = loadAdsTokenKeyring()
  } catch {
    return googleAdsRedirect(request, { google: 'configuration_missing' })
  }

  const flowId = randomUUID()
  const state = createGoogleOAuthState({
    userId,
    flowId,
    secret: resolved.settings.stateSecret,
  })
  const pkce = createGooglePkcePair()
  const encryptedVerifier = encryptAdsToken(pkce.verifier, googleOAuthTokenContext(userId, flowId), keyring)
  const admin = createAdminClient()
  const { error } = await admin.from('ads_google_oauth_flows').insert({
    id: flowId,
    user_id: userId,
    state_hash: hashGoogleOAuthState(state.state),
    code_verifier_enc: encryptedVerifier.ciphertext,
    status: 'started',
    account_candidates: [],
    scopes: [],
    expires_at: state.expiresAt,
  })

  if (error) {
    console.error('[google-ads] OAuth flow create failed')
    return googleAdsRedirect(request, { google: 'provider_error' })
  }

  const provider = createGoogleAdsProvider({
    clientId: resolved.settings.clientId,
    clientSecret: resolved.settings.clientSecret,
    redirectUri: resolved.settings.redirectUri,
  })
  const authorizationUrl = provider.buildAuthUrl({
    state: state.state,
    redirectUri: resolved.settings.redirectUri,
    codeChallenge: pkce.challenge,
  })
  const response = NextResponse.redirect(authorizationUrl, 303)
  response.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.cookies.set(googleOAuthCookieName(flowId), state.nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: GOOGLE_OAUTH_CALLBACK_COOKIE_PATH,
    maxAge: 15 * 60,
  })
  return response
}
