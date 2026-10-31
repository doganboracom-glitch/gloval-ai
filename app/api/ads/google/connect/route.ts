import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGoogleAdsConnectUser } from '@/lib/ads/google-ads-route-auth'
import {
  createGoogleAdsOAuthArtifacts,
  createGoogleAdsProviderFromEnv,
  encryptGoogleAdsOAuthFlowSecret,
  hasGoogleAdsOAuthConfiguration,
  GOOGLE_ADS_OAUTH_FLOW_TTL_MS,
} from '@/lib/ads/google-ads-oauth-server'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const access = await requireGoogleAdsConnectUser()
  if (!access.ok) return access.response

  const stateSecret = process.env.ADS_OAUTH_STATE_SECRET
  if (!hasGoogleAdsOAuthConfiguration() || !stateSecret || stateSecret.trim().length < 32) {
    return NextResponse.json({ error: 'configuration_unavailable' }, { status: 503 })
  }

  try {
    const flowId = randomUUID()
    const artifacts = createGoogleAdsOAuthArtifacts(stateSecret)
    const verifier = encryptGoogleAdsOAuthFlowSecret(artifacts.codeVerifier, access.userId, flowId)
    const redirectUri = new URL('/api/ads/google/callback', request.url).toString()
    const authorizationUrl = createGoogleAdsProviderFromEnv().buildAuthUrl({
      state: artifacts.state,
      codeChallenge: artifacts.codeChallenge,
      redirectUri,
    })
    const admin = createAdminClient()
    const { error } = await admin.from('ads_google_oauth_flows').insert({
      id: flowId,
      user_id: access.userId,
      state_hash: artifacts.stateHash,
      code_verifier_enc: verifier.ciphertext,
      pending_refresh_token_enc: null,
      token_key_version: verifier.keyVersion,
      status: 'started',
      expires_at: new Date(Date.now() + GOOGLE_ADS_OAUTH_FLOW_TTL_MS).toISOString(),
    })

    if (error) return NextResponse.json({ error: 'connection_start_failed' }, { status: 503 })

    const response = NextResponse.redirect(authorizationUrl)
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch {
    return NextResponse.json({ error: 'connection_start_failed' }, { status: 503 })
  }
}
