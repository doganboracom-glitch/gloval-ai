import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAdsTokenKeyring, decryptAdsToken, encryptAdsToken } from '@/lib/ads/token-crypto'
import { createGoogleAdsProvider } from '@/lib/ads/providers/google-ads-provider'
import { createGoogleAdsApiTransport } from '@/lib/ads/google-api-client'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import { GOOGLE_OAUTH_CALLBACK_COOKIE_PATH, googleOAuthCookieName, hashGoogleOAuthState, readGoogleOAuthFlowId, secureTextEquals, verifyGoogleOAuthState } from '@/lib/ads/google-oauth-state'
import { googleOAuthTokenContext } from '@/lib/ads/google-connections'
import { resolveGoogleAdsOAuthSettings } from '@/lib/ads/env'
import { googleAdsFeatureEnabled, googleAdsRedirect, googleAdsUserId } from '@/lib/ads/google-route-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function addCookieCleanup(response: NextResponse, flowId: string) {
  response.cookies.set(googleOAuthCookieName(flowId), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: GOOGLE_OAUTH_CALLBACK_COOKIE_PATH,
    maxAge: 0,
  })
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

async function deleteFlow(admin: ReturnType<typeof createAdminClient>, flowId: string, userId: string) {
  const { error } = await admin.from('ads_google_oauth_flows').delete().eq('id', flowId).eq('user_id', userId)
  if (error) console.error('[google-ads] OAuth flow cleanup failed', { flowId })
}

export async function GET(request: Request) {
  if (!googleAdsFeatureEnabled()) return new NextResponse(null, { status: 404 })

  const url = new URL(request.url)
  const stateValue = url.searchParams.get('state') ?? ''
  const flowId = readGoogleOAuthFlowId(stateValue)
  if (!flowId) return googleAdsRedirect(request, { google: 'state_invalid' })

  const claims = verifyGoogleOAuthState(
    stateValue,
    process.env.ADS_OAUTH_STATE_SECRET ?? '',
  )
  if (!claims || claims.flow !== flowId) {
    return addCookieCleanup(googleAdsRedirect(request, { google: 'state_invalid' }), flowId)
  }

  const userId = await googleAdsUserId()
  if (!userId) {
    return addCookieCleanup(
      NextResponse.redirect(new URL('/auth/login?next=/ads/dashboard', request.url), 303),
      flowId,
    )
  }
  if (claims.sub !== userId) {
    return addCookieCleanup(googleAdsRedirect(request, { google: 'state_invalid' }), flowId)
  }

  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(googleOAuthCookieName(flowId))?.value ?? ''
  if (!cookieValue || !secureTextEquals(cookieValue, claims.nonce)) {
    return addCookieCleanup(googleAdsRedirect(request, { google: 'state_invalid' }), flowId)
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: flow, error: consumeError } = await admin
    .from('ads_google_oauth_flows')
    .update({ status: 'exchanging', state_consumed_at: now })
    .eq('id', flowId)
    .eq('user_id', userId)
    .eq('state_hash', hashGoogleOAuthState(stateValue))
    .eq('status', 'started')
    .gt('expires_at', now)
    .select('id,code_verifier_enc')
    .maybeSingle()

  if (consumeError || !flow?.code_verifier_enc) {
    return addCookieCleanup(googleAdsRedirect(request, { google: 'state_invalid' }), flowId)
  }

  const providerError = url.searchParams.get('error')
  if (providerError === 'access_denied') {
    await deleteFlow(admin, flowId, userId)
    return addCookieCleanup(googleAdsRedirect(request, { google: 'oauth_denied' }), flowId)
  }

  const code = url.searchParams.get('code')
  if (!code || code.length > 4096) {
    await deleteFlow(admin, flowId, userId)
    return addCookieCleanup(googleAdsRedirect(request, { google: 'oauth_failed' }), flowId)
  }

  const resolved = resolveGoogleAdsOAuthSettings()
  if (!resolved.ok) {
    await deleteFlow(admin, flowId, userId)
    return addCookieCleanup(googleAdsRedirect(request, { google: 'configuration_missing' }), flowId)
  }

  let keyring
  let verifier: string
  try {
    keyring = loadAdsTokenKeyring()
    verifier = decryptAdsToken(flow.code_verifier_enc, googleOAuthTokenContext(userId, flowId), keyring)
  } catch {
    await deleteFlow(admin, flowId, userId)
    return addCookieCleanup(googleAdsRedirect(request, { google: 'configuration_missing' }), flowId)
  }

  try {
    const apiTransport = createGoogleAdsApiTransport({
      userId,
      connectionId: null,
      developerToken: resolved.settings.developerToken,
    })
    const provider = createGoogleAdsProvider({
      clientId: resolved.settings.clientId,
      clientSecret: resolved.settings.clientSecret,
      redirectUri: resolved.settings.redirectUri,
      requestAdsApi: apiTransport,
    })
    const tokenSet = await provider.exchangeCodeWithVerifier({
      code,
      redirectUri: resolved.settings.redirectUri,
      codeVerifier: verifier,
    })
    const accounts = await provider.listAccountsForUser(tokenSet.accessToken, { userId, connectionId: null })
    const pendingToken = encryptAdsToken(
      tokenSet.refreshToken,
      googleOAuthTokenContext(userId, flowId),
      keyring,
    )
    const candidates = accounts.map((account) => ({
      externalAccountId: account.externalAccountId,
      name: account.name,
      currency: account.currency,
      isManager: account.isManager,
      loginCustomerId: account.loginCustomerId,
    }))

    const { data: saved, error: saveError } = await admin
      .from('ads_google_oauth_flows')
      .update({
        status: 'awaiting_account',
        code_verifier_enc: null,
        pending_refresh_token_enc: pendingToken.ciphertext,
        account_candidates: candidates,
        scopes: tokenSet.scopes,
      })
      .eq('id', flowId)
      .eq('user_id', userId)
      .eq('status', 'exchanging')
      .gt('expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle()

    if (saveError || !saved) throw new GoogleAdsError('flow_expired')
    return addCookieCleanup(googleAdsRedirect(request, { google_flow: flowId }), flowId)
  } catch (error) {
    await deleteFlow(admin, flowId, userId)
    const code = error instanceof GoogleAdsError ? error.code : 'oauth_failed'
    return addCookieCleanup(googleAdsRedirect(request, { google: code }), flowId)
  }
}
