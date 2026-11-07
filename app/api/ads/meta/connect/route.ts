import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveMetaRedirectUri } from '@/lib/ads/env'
import {
  META_OAUTH_CALLBACK_COOKIE_PATH,
  createMetaOAuthState,
  hashMetaOAuthState,
  metaOAuthCookieName,
} from '@/lib/ads/meta-oauth-state'
import { createConfiguredMetaProvider } from '@/lib/ads/meta-provider-factory'
import {
  isSameOriginMetaAdsPost,
  metaAdsFeatureEnabled,
  metaAdsJson,
  metaAdsKillSwitchActive,
  metaAdsRedirect,
  metaAdsRequestAccess,
} from '@/lib/ads/meta-route-utils'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!metaAdsFeatureEnabled()) return metaAdsJson({ error: 'not_found' }, 404)
  if (!isSameOriginMetaAdsPost(request)) return metaAdsJson({ error: 'csrf_failed' }, 403)

  const access = await metaAdsRequestAccess()
  if (!access) return NextResponse.redirect(new URL('/auth/login?next=/ads/dashboard', request.url), 303)
  if (!access.decision.canConnect) return metaAdsJson({ error: 'not_found' }, 404)
  if (metaAdsKillSwitchActive()) return metaAdsRedirect(request, { meta: 'kill_switch_active' })

  const rate = checkRateLimit(`meta-ads-connect:${access.userId}`, 3, 60_000)
  if (!rate.allowed) return metaAdsRedirect(request, { meta: 'rate_limited' })

  const configured = createConfiguredMetaProvider()
  const redirectUri = resolveMetaRedirectUri(request.url)
  if (!configured.ok || !redirectUri) return metaAdsRedirect(request, { meta: 'configuration_missing' })

  const flowId = randomUUID()
  const state = createMetaOAuthState({ userId: access.userId, flowId, secret: configured.stateSecret })
  const admin = createAdminClient()
  const { error } = await admin.from('ads_meta_oauth_flows').insert({
    id: flowId,
    user_id: access.userId,
    state_hash: hashMetaOAuthState(state.state),
    status: 'started',
    expires_at: state.expiresAt,
  })
  if (error) {
    console.error('[meta-ads] OAuth flow create failed')
    return metaAdsRedirect(request, { meta: 'provider_error' })
  }

  // Write permissions are only requested on explicit opt-in, and only for users allowed to publish.
  const wantsManage = await request
    .clone()
    .formData()
    .then((form) => form.get('intent') === 'manage')
    .catch(() => false)
  const authorizationUrl = wantsManage && access.decision.canPublish
    ? configured.provider.buildManageAuthUrl({ state: state.state, redirectUri })
    : configured.provider.buildAuthUrl({ state: state.state, redirectUri })
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
