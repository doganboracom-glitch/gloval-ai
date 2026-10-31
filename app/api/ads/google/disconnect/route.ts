import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canDisconnectGoogleAdsConnection } from '@/lib/ads/google-ads-gate'
import { getAuthenticatedUserId } from '@/lib/ads/google-ads-route-auth'
import { createGoogleAdsProviderFromEnv } from '@/lib/ads/google-ads-oauth-server'
import { decryptAdsToken, loadAdsTokenKeyring } from '@/lib/ads/token-crypto'

export const runtime = 'nodejs'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function DELETE(request: Request) {
  const userId = await getAuthenticatedUserId()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const connectionId = new URL(request.url).searchParams.get('connection_id')
  if (!connectionId || !UUID_PATTERN.test(connectionId)) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const admin = createAdminClient()
  const { data: connection, error: lookupError } = await admin
    .from('ads_connections')
    .select('id,user_id,external_account_id,refresh_token_enc')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .eq('platform', 'google_ads')
    .maybeSingle()

  if (lookupError || !connection || !canDisconnectGoogleAdsConnection(Boolean(connection))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (connection.refresh_token_enc) {
    try {
      const refreshToken = decryptAdsToken(
        connection.refresh_token_enc,
        { userId, platform: 'google_ads', externalAccountId: connection.external_account_id },
        loadAdsTokenKeyring(),
      )
      await createGoogleAdsProviderFromEnv().revoke(refreshToken)
    } catch {
      return NextResponse.json({ error: 'disconnect_failed' }, { status: 502 })
    }
  }

  const { error: deleteError } = await admin
    .from('ads_connections')
    .delete()
    .eq('id', connectionId)
    .eq('user_id', userId)
    .eq('platform', 'google_ads')

  if (deleteError) {
    await admin
      .from('ads_connections')
      .update({ status: 'revoked', refresh_token_enc: null, last_error: null })
      .eq('id', connectionId)
      .eq('user_id', userId)
      .eq('platform', 'google_ads')
    return NextResponse.json({ error: 'disconnect_cleanup_pending' }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
