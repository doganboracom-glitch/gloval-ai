import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveMetaRedirectUri } from '@/lib/ads/env'
import { MetaAdsError, isMetaAdsError } from '@/lib/ads/meta-ads-error'
import { missingMetaRequiredScopes } from '@/lib/ads/meta-ads-shared'
import {
  META_OAUTH_CALLBACK_COOKIE_PATH,
  hashMetaOAuthState,
  metaOAuthCookieName,
  metaTokenContext,
  readMetaOAuthFlowId,
  secureMetaTextEquals,
  verifyMetaOAuthState,
} from '@/lib/ads/meta-oauth-state'
import { createConfiguredMetaProvider } from '@/lib/ads/meta-provider-factory'
import {
  metaAdsFeatureEnabled,
  metaAdsKillSwitchActive,
  metaAdsRedirect,
  metaAdsRequestAccess,
} from '@/lib/ads/meta-route-utils'
import { encryptAdsToken, loadAdsTokenKeyring } from '@/lib/ads/token-crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const DEFAULT_TOKEN_LIFETIME_MS = 60 * 86_400_000

function withCookieCleanup(response: NextResponse, flowId: string) {
  response.cookies.set(metaOAuthCookieName(flowId), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: META_OAUTH_CALLBACK_COOKIE_PATH,
    maxAge: 0,
  })
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

type Admin = ReturnType<typeof createAdminClient>

async function deleteFlow(admin: Admin, flowId: string, userId: string) {
  const { error } = await admin.from('ads_meta_oauth_flows').delete().eq('id', flowId).eq('user_id', userId)
  if (error) console.error('[meta-ads] OAuth flow cleanup failed')
}

export async function GET(request: Request) {
  if (!metaAdsFeatureEnabled()) return new NextResponse(null, { status: 404 })

  const url = new URL(request.url)
  const stateValue = url.searchParams.get('state') ?? ''
  const flowId = readMetaOAuthFlowId(stateValue)
  if (!flowId) return metaAdsRedirect(request, { meta: 'state_invalid' })
  const done = (values: Record<string, string>) => withCookieCleanup(metaAdsRedirect(request, values), flowId)

  const configured = createConfiguredMetaProvider()
  if (!configured.ok) return done({ meta: 'configuration_missing' })

  const claims = verifyMetaOAuthState(stateValue, configured.stateSecret)
  if (!claims || claims.flow !== flowId) return done({ meta: 'state_invalid' })

  const access = await metaAdsRequestAccess()
  if (!access) {
    return withCookieCleanup(NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent('/ads/dashboard?platform=meta')}`, request.url), 303), flowId)
  }
  const userId = access.userId
  if (claims.sub !== userId) return done({ meta: 'state_invalid' })

  const admin = createAdminClient()
  if (!access.decision.canConnect) {
    await deleteFlow(admin, flowId, userId)
    return done({ meta: 'not_found' })
  }
  if (metaAdsKillSwitchActive()) {
    await deleteFlow(admin, flowId, userId)
    return done({ meta: 'kill_switch_active' })
  }

  const cookieStore = await cookies()
  const cookieNonce = cookieStore.get(metaOAuthCookieName(flowId))?.value ?? ''
  if (!cookieNonce || !secureMetaTextEquals(cookieNonce, claims.nonce)) return done({ meta: 'state_invalid' })

  const { data: flow, error: flowError } = await admin
    .from('ads_meta_oauth_flows')
    .select('id')
    .eq('id', flowId)
    .eq('user_id', userId)
    .eq('state_hash', hashMetaOAuthState(stateValue))
    .eq('status', 'started')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (flowError || !flow) return done({ meta: 'state_invalid' })

  const providerError = url.searchParams.get('error')
  if (providerError) {
    await deleteFlow(admin, flowId, userId)
    return done({ meta: providerError === 'access_denied' ? 'oauth_denied' : 'oauth_failed' })
  }

  const code = url.searchParams.get('code')
  const redirectUri = resolveMetaRedirectUri(request.url)
  if (!code || code.length > 4096 || !redirectUri) {
    await deleteFlow(admin, flowId, userId)
    return done({ meta: 'oauth_failed' })
  }

  let keyring
  try {
    keyring = loadAdsTokenKeyring()
  } catch {
    await deleteFlow(admin, flowId, userId)
    return done({ meta: 'configuration_missing' })
  }

  const { provider } = configured
  const context = { userId, connectionId: null }
  let accessToken: string | null = null
  try {
    const token = await provider.exchangeCodeForLongLivedToken({ code, redirectUri, context })
    accessToken = token.accessToken

    const inspection = await provider.inspectToken({ accessToken, context })
    if (!inspection.isValid) throw new MetaAdsError('oauth_failed')
    const missing = missingMetaRequiredScopes(inspection.scopes)
    if (missing.length > 0) {
      // In config_id mode the user cannot change the permission list: the Meta app's Configuration is at fault.
      throw new MetaAdsError(configured.loginMode === 'config_id' ? 'config_permission_missing' : 'permission_missing', null, missing)
    }

    const accounts = await provider.listAdAccounts({ accessToken, context })
    if (accounts.length === 0) throw new MetaAdsError('no_accounts')
    // Pages/Instagram are optional context: a failure here must not block a connect that already has ad accounts.
    const pages = await provider.listPages({ accessToken, context }).catch(() => [])

    const encrypted = encryptAdsToken(accessToken, metaTokenContext(userId, flowId), keyring)
    const expiresAt = inspection.expiresAt ?? token.expiresAt ?? new Date(Date.now() + DEFAULT_TOKEN_LIFETIME_MS).toISOString()

    const { data: saved, error: saveError } = await admin
      .from('ads_meta_oauth_flows')
      .update({
        status: 'awaiting_account',
        state_consumed_at: new Date().toISOString(),
        pending_token_enc: encrypted.ciphertext,
        pending_token_key_version: encrypted.keyVersion,
        pending_token_expires_at: expiresAt,
        pending_meta_user_id: inspection.metaUserId,
        granted_scopes: inspection.scopes,
        account_candidates: accounts,
        page_candidates: pages,
      })
      .eq('id', flowId)
      .eq('user_id', userId)
      .eq('status', 'started')
      .gt('expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle()
    if (saveError || !saved) throw new MetaAdsError('flow_expired')

    return done({ meta_flow: flowId })
  } catch (error) {
    if (accessToken) {
      await provider.revokePermissions({ accessToken, context }).catch(() => {
        console.error('[meta-ads] permission revoke after failed connect did not complete')
      })
    }
    await deleteFlow(admin, flowId, userId)
    if (isMetaAdsError(error)) {
      const values: Record<string, string> = { meta: error.code }
      if (error.code === 'permission_missing' && error.missingScopes.length > 0) {
        values.meta_missing = error.missingScopes.join(',')
      }
      return done(values)
    }
    console.error('[meta-ads] OAuth callback failed')
    return done({ meta: 'provider_error' })
  }
}
