import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGoogleAdsConnectUser } from '@/lib/ads/google-ads-route-auth'
import {
  createGoogleAdsProviderFromEnv,
  decryptGoogleAdsOAuthFlowSecret,
  retireGoogleAdsOAuthFlow,
} from '@/lib/ads/google-ads-oauth-server'
import { encryptAdsToken, loadAdsTokenKeyring } from '@/lib/ads/token-crypto'
import { type AdsAccountSummary } from '@/lib/ads/providers/types'
import { GOOGLE_ADS_SCOPE } from '@/lib/ads/providers/google-ads-provider'

export const runtime = 'nodejs'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseCandidate(value: unknown): AdsAccountSummary | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (typeof item.externalAccountId !== 'string' || !/^\d{10}$/.test(item.externalAccountId)) return null
  if (item.loginCustomerId !== null && item.loginCustomerId !== undefined && (typeof item.loginCustomerId !== 'string' || !/^\d{10}$/.test(item.loginCustomerId))) {
    return null
  }

  return {
    externalAccountId: item.externalAccountId,
    name: typeof item.name === 'string' ? item.name.slice(0, 200) : null,
    currency: typeof item.currency === 'string' && /^[A-Z]{3}$/.test(item.currency) ? item.currency : null,
    loginCustomerId: typeof item.loginCustomerId === 'string' ? item.loginCustomerId : null,
    isManager: item.isManager === true,
  }
}

function parseCandidates(value: unknown): AdsAccountSummary[] {
  if (!Array.isArray(value)) return []
  return value.map(parseCandidate).filter((candidate): candidate is AdsAccountSummary => candidate !== null)
}

async function revokeFailedSelection(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  flowId: string,
  refreshToken: string,
): Promise<void> {
  try {
    await createGoogleAdsProviderFromEnv().revoke(refreshToken)
    await retireGoogleAdsOAuthFlow(admin, userId, flowId)
  } catch {
    // Keep the encrypted pending token for the purge job when revocation fails.
  }
}

export async function GET(request: Request) {
  const access = await requireGoogleAdsConnectUser()
  if (!access.ok) return access.response

  const flowId = new URL(request.url).searchParams.get('flow_id')
  if (!flowId || !UUID_PATTERN.test(flowId)) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: flow, error } = await admin
    .from('ads_google_oauth_flows')
    .select('id,account_candidates')
    .eq('id', flowId)
    .eq('user_id', access.userId)
    .eq('status', 'awaiting_account')
    .gt('expires_at', now)
    .maybeSingle()

  if (error || !flow) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({ flowId, accounts: parseCandidates(flow.account_candidates) }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(request: Request) {
  const access = await requireGoogleAdsConnectUser()
  if (!access.ok) return access.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const input = body as Record<string, unknown>
  const flowId = input.flowId
  const externalAccountId = input.externalAccountId
  if (typeof flowId !== 'string' || !UUID_PATTERN.test(flowId) || typeof externalAccountId !== 'string' || !/^\d{10}$/.test(externalAccountId)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: flow, error: flowError } = await admin
    .from('ads_google_oauth_flows')
    .select('id,user_id,pending_refresh_token_enc,account_candidates')
    .eq('id', flowId)
    .eq('user_id', access.userId)
    .eq('status', 'awaiting_account')
    .gt('expires_at', now)
    .maybeSingle()

  if (flowError || !flow?.pending_refresh_token_enc) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const account = parseCandidates(flow.account_candidates).find((candidate) => candidate.externalAccountId === externalAccountId)
  if (!account) return NextResponse.json({ error: 'invalid_account' }, { status: 400 })

  let refreshToken: string
  try {
    refreshToken = decryptGoogleAdsOAuthFlowSecret(flow.pending_refresh_token_enc, access.userId, flowId)
  } catch {
    return NextResponse.json({ error: 'connection_failed' }, { status: 500 })
  }

  let encryptedConnectionToken
  try {
    encryptedConnectionToken = encryptAdsToken(
      refreshToken,
      { userId: access.userId, platform: 'google_ads', externalAccountId: account.externalAccountId },
      loadAdsTokenKeyring(),
    )
  } catch {
    await revokeFailedSelection(admin, access.userId, flowId, refreshToken)
    return NextResponse.json({ error: 'connection_failed' }, { status: 500 })
  }

  const { data: connection, error: upsertError } = await admin
    .from('ads_connections')
    .upsert(
      {
        user_id: access.userId,
        platform: 'google_ads',
        external_account_id: account.externalAccountId,
        external_account_name: account.name,
        login_customer_id: account.loginCustomerId,
        currency_code: account.currency,
        is_manager: account.isManager === true,
        refresh_token_enc: encryptedConnectionToken.ciphertext,
        token_key_version: encryptedConnectionToken.keyVersion,
        scopes: [GOOGLE_ADS_SCOPE],
        status: 'active',
        last_error: null,
        updated_at: now,
      },
      { onConflict: 'user_id,platform,external_account_id' },
    )
    .select('id')
    .single()

  if (upsertError || !connection?.id) {
    await revokeFailedSelection(admin, access.userId, flowId, refreshToken)
    return NextResponse.json({ error: 'connection_failed' }, { status: 502 })
  }

  try {
    await retireGoogleAdsOAuthFlow(admin, access.userId, flowId)
  } catch {
    await admin
      .from('ads_connections')
      .update({ status: 'error', refresh_token_enc: null, last_error: 'oauth_flow_cleanup_failed' })
      .eq('id', connection.id)
      .eq('user_id', access.userId)
    return NextResponse.json({ error: 'connection_cleanup_pending' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, connectionId: connection.id })
}
