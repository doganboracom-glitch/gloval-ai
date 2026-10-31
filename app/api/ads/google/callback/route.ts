import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdsProviderError, type AdsAccountSummary } from '@/lib/ads/providers/types'
import { requireGoogleAdsConnectUser } from '@/lib/ads/google-ads-route-auth'
import {
  createGoogleAdsProviderForUser,
  createGoogleAdsProviderFromEnv,
  decryptGoogleAdsOAuthFlowSecret,
  encryptGoogleAdsOAuthFlowSecret,
  hasGoogleAdsOAuthConfiguration,
  hashGoogleAdsOAuthState,
  retireGoogleAdsOAuthFlow,
} from '@/lib/ads/google-ads-oauth-server'

export const runtime = 'nodejs'

function dashboardRedirect(requestUrl: string, status: string, flowId?: string) {
  const url = new URL('/ads/dashboard', requestUrl)
  url.searchParams.set('googleAds', status)
  if (flowId) url.searchParams.set('googleAdsFlow', flowId)
  const response = NextResponse.redirect(url)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function safeAccounts(accounts: AdsAccountSummary[]): AdsAccountSummary[] {
  const unique = new Map<string, AdsAccountSummary>()
  for (const account of accounts) {
    if (!/^\d{10}$/.test(account.externalAccountId)) continue
    if (account.loginCustomerId && !/^\d{10}$/.test(account.loginCustomerId)) continue
    unique.set(account.externalAccountId, {
      externalAccountId: account.externalAccountId,
      name: account.name?.slice(0, 200) ?? null,
      currency: account.currency && /^[A-Z]{3}$/.test(account.currency) ? account.currency : null,
      loginCustomerId: account.loginCustomerId,
      isManager: account.isManager === true,
    })
  }
  return [...unique.values()]
}

async function tryRevokeAndRetire(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  flowId: string,
  refreshToken: string,
): Promise<boolean> {
  try {
    await createGoogleAdsProviderFromEnv().revoke(refreshToken)
    await retireGoogleAdsOAuthFlow(admin, userId, flowId)
    return true
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  const access = await requireGoogleAdsConnectUser()
  if (!access.ok) return access.response

  const url = new URL(request.url)
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  const providerError = url.searchParams.get('error')
  const stateSecret = process.env.ADS_OAUTH_STATE_SECRET
  if (!state || state.length > 128 || !stateSecret || stateSecret.trim().length < 32) {
    return dashboardRedirect(request.url, 'failed')
  }

  const admin = createAdminClient()
  const stateHash = hashGoogleAdsOAuthState(state, stateSecret)

  if (providerError) {
    await admin
      .from('ads_google_oauth_flows')
      .delete()
      .eq('user_id', access.userId)
      .eq('state_hash', stateHash)
      .eq('status', 'started')
    return dashboardRedirect(request.url, 'cancelled')
  }

  if (!code || code.length > 4096 || !hasGoogleAdsOAuthConfiguration()) {
    return dashboardRedirect(request.url, 'failed')
  }

  const now = new Date().toISOString()
  const { data: flow, error: claimError } = await admin
    .from('ads_google_oauth_flows')
    .update({ status: 'exchanging', state_consumed_at: now })
    .eq('user_id', access.userId)
    .eq('state_hash', stateHash)
    .eq('status', 'started')
    .is('state_consumed_at', null)
    .gt('expires_at', now)
    .select('id,user_id,code_verifier_enc')
    .maybeSingle()

  if (claimError || !flow?.code_verifier_enc) return dashboardRedirect(request.url, 'failed')

  const flowId = String(flow.id)
  const redirectUri = new URL('/api/ads/google/callback', request.url).toString()
  const provider = createGoogleAdsProviderForUser(admin, access.userId)
  let tokenSet

  try {
    const codeVerifier = decryptGoogleAdsOAuthFlowSecret(flow.code_verifier_enc, access.userId, flowId)
    tokenSet = await provider.exchangeCode({ code, redirectUri, codeVerifier })
  } catch (error) {
    try {
      await retireGoogleAdsOAuthFlow(admin, access.userId, flowId)
    } catch {
      // An expired tokenless flow is removed by the purge job.
    }
    const status = error instanceof AdsProviderError && error.code === 'rate_limited' ? 'quota' : 'failed'
    return dashboardRedirect(request.url, status)
  }

  let pendingToken
  try {
    pendingToken = encryptGoogleAdsOAuthFlowSecret(tokenSet.refreshToken, access.userId, flowId)
  } catch {
    await tryRevokeAndRetire(admin, access.userId, flowId, tokenSet.refreshToken)
    return dashboardRedirect(request.url, 'failed')
  }

  const { error: saveTokenError } = await admin
    .from('ads_google_oauth_flows')
    .update({
      status: 'awaiting_account',
      state_consumed_at: now,
      code_verifier_enc: null,
      pending_refresh_token_enc: pendingToken.ciphertext,
      token_key_version: pendingToken.keyVersion,
      account_candidates: [],
    })
    .eq('id', flowId)
    .eq('user_id', access.userId)
    .eq('status', 'exchanging')

  if (saveTokenError) {
    const revoked = await tryRevokeAndRetire(admin, access.userId, flowId, tokenSet.refreshToken)
    if (!revoked) {
      await admin
        .from('ads_google_oauth_flows')
        .update({
          status: 'awaiting_account',
          state_consumed_at: now,
          code_verifier_enc: null,
          pending_refresh_token_enc: pendingToken.ciphertext,
          token_key_version: pendingToken.keyVersion,
          account_candidates: [],
        })
        .eq('id', flowId)
        .eq('user_id', access.userId)
        .eq('status', 'exchanging')
    }
    return dashboardRedirect(request.url, revoked ? 'failed' : 'revoke_pending')
  }

  let accounts: AdsAccountSummary[]
  try {
    accounts = safeAccounts(await provider.listAccounts(tokenSet.accessToken))
  } catch (error) {
    const revoked = await tryRevokeAndRetire(admin, access.userId, flowId, tokenSet.refreshToken)
    const status = !revoked ? 'revoke_pending' : error instanceof AdsProviderError && error.code === 'rate_limited' ? 'quota' : 'failed'
    return dashboardRedirect(request.url, status)
  }

  if (accounts.length === 0) {
    const revoked = await tryRevokeAndRetire(admin, access.userId, flowId, tokenSet.refreshToken)
    return dashboardRedirect(request.url, revoked ? 'no_accounts' : 'revoke_pending')
  }

  const { error: candidateError } = await admin
    .from('ads_google_oauth_flows')
    .update({ account_candidates: accounts })
    .eq('id', flowId)
    .eq('user_id', access.userId)
    .eq('status', 'awaiting_account')

  if (candidateError) {
    const revoked = await tryRevokeAndRetire(admin, access.userId, flowId, tokenSet.refreshToken)
    return dashboardRedirect(request.url, revoked ? 'failed' : 'revoke_pending')
  }

  return dashboardRedirect(request.url, 'select_account', flowId)
}
