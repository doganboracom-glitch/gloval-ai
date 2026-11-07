import { cookies } from 'next/headers'
import { resolveMetaAdsOAuthSettings } from '@/lib/ads/env'
import { readGoogleOAuthFlowId, secureTextEquals, verifyGoogleOAuthState } from '@/lib/ads/google-oauth-state'
import { exchangeMetaCode, inspectMetaToken } from '@/lib/ads/meta-graph'
import { checkMetaGrantedPermissions, META_OAUTH_CALLBACK_COOKIE_PATH, metaOAuthCookieName, resolveMetaLoginMode } from '@/lib/ads/meta-oauth'
import { googleAdsFeatureEnabled, googleAdsJson, googleAdsRedirect, googleAdsRequestAccess } from '@/lib/ads/google-route-utils'

export const dynamic = 'force-dynamic'

function clearFlowCookie(response: Response, flowId: string | null) {
  if (!flowId) return response
  const headers = response.headers
  headers.append(
    'Set-Cookie',
    `${metaOAuthCookieName(flowId)}=; Path=${META_OAUTH_CALLBACK_COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax`,
  )
  return response
}

/**
 * Verifies state, exchanges the code and checks the granted permissions in
 * both login modes. The access token is NOT persisted here.
 */
export async function GET(request: Request) {
  if (!googleAdsFeatureEnabled()) return googleAdsJson({ error: 'not_found' }, 404)

  const access = await googleAdsRequestAccess()
  if (!access?.userId || !access.decision.canConnect) return googleAdsJson({ error: 'not_found' }, 404)

  const resolved = resolveMetaAdsOAuthSettings()
  if (!resolved.ok) return googleAdsRedirect(request, { meta: resolved.reason })
  const { settings } = resolved

  const params = new URL(request.url).searchParams
  const state = params.get('state') ?? ''
  const flowId = readGoogleOAuthFlowId(state)
  const done = (values: Record<string, string>) => clearFlowCookie(googleAdsRedirect(request, values), flowId)

  if (params.get('error')) return done({ meta: 'access_denied' })

  const claims = verifyGoogleOAuthState(state, settings.stateSecret)
  const cookieNonce = flowId ? (await cookies()).get(metaOAuthCookieName(flowId))?.value : undefined
  if (!claims || claims.sub !== access.userId || !cookieNonce || !secureTextEquals(cookieNonce, claims.nonce)) {
    return done({ meta: 'invalid_state' })
  }

  const code = params.get('code')
  if (!code) return done({ meta: 'invalid_request' })

  try {
    const accessToken = await exchangeMetaCode({
      appId: settings.appId,
      appSecret: settings.appSecret,
      redirectUri: settings.redirectUri,
      code,
    })
    if (!accessToken) return done({ meta: 'provider_error' })

    const inspection = await inspectMetaToken({ appId: settings.appId, appSecret: settings.appSecret, accessToken })
    if (!inspection || !inspection.valid || inspection.appId !== settings.appId) return done({ meta: 'provider_error' })

    const check = checkMetaGrantedPermissions(resolveMetaLoginMode(settings.loginConfigId), inspection.grantedPermissions)
    if (!check.ok) {
      console.error(`[meta-ads] ${check.message}`)
      return done({ meta: check.code })
    }
    return done({ meta: 'permissions_verified' })
  } catch {
    return done({ meta: 'provider_error' })
  }
}
