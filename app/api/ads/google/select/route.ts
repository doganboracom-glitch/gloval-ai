import { createAdminClient } from '@/lib/supabase/admin'
import { loadAdsTokenKeyring, decryptAdsToken } from '@/lib/ads/token-crypto'
import { saveGoogleAdsConnectionFromOAuth, googleOAuthTokenContext } from '@/lib/ads/google-connections'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import { GOOGLE_ADS_SCOPE } from '@/lib/ads/providers/google-ads-provider'
import { checkRateLimit } from '@/lib/rate-limit'
import { googleAdsErrorResponse, googleAdsFeatureEnabled, googleAdsJson, googleAdsUserId, isSameOriginGoogleAdsPost } from '@/lib/ads/google-route-utils'
import type { AdsAccountSummary } from '@/lib/ads/providers/types'

export const dynamic = 'force-dynamic'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safeCandidates(value: unknown): AdsAccountSummary[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const id = typeof row.externalAccountId === 'string' ? row.externalAccountId : ''
    if (!/^\d{6,20}$/.test(id)) return []
    const loginCustomerId = typeof row.loginCustomerId === 'string' && /^\d{6,20}$/.test(row.loginCustomerId)
      ? row.loginCustomerId
      : null
    return [{
      externalAccountId: id,
      name: typeof row.name === 'string' ? row.name.slice(0, 120) : null,
      currency: typeof row.currency === 'string' && /^[A-Z]{3}$/.test(row.currency) ? row.currency : null,
      isManager: row.isManager === true,
      loginCustomerId,
    }]
  })
}

export async function GET(request: Request) {
  if (!googleAdsFeatureEnabled()) return googleAdsJson({ error: 'not_found' }, 404)
  const userId = await googleAdsUserId()
  if (!userId) return googleAdsJson({ error: 'not_authenticated' }, 401)

  const flowId = new URL(request.url).searchParams.get('flowId') ?? ''
  if (!UUID_PATTERN.test(flowId)) return googleAdsJson({ error: 'invalid_request' }, 400)

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('ads_google_oauth_flows')
    .select('id,account_candidates,expires_at')
    .eq('id', flowId)
    .eq('user_id', userId)
    .eq('status', 'awaiting_account')
    .gt('expires_at', now)
    .maybeSingle()

  if (error) return googleAdsJson({ error: 'provider_error' }, 502)
  if (!data) return googleAdsJson({ error: 'flow_expired' }, 404)
  return googleAdsJson({ accounts: safeCandidates(data.account_candidates) })
}

export async function POST(request: Request) {
  if (!googleAdsFeatureEnabled()) return googleAdsJson({ error: 'not_found' }, 404)
  if (!isSameOriginGoogleAdsPost(request)) return googleAdsJson({ error: 'csrf_failed' }, 403)

  const userId = await googleAdsUserId()
  if (!userId) return googleAdsJson({ error: 'not_authenticated' }, 401)
  const rate = checkRateLimit(`google-ads-select:${userId}`, 10, 60_000)
  if (!rate.allowed) return googleAdsJson({ error: 'rate_limited' }, 429)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return googleAdsJson({ error: 'invalid_request' }, 400)
  }
  if (!body || typeof body !== 'object') return googleAdsJson({ error: 'invalid_request' }, 400)
  const input = body as Record<string, unknown>
  const flowId = typeof input.flowId === 'string' ? input.flowId : ''
  const accountId = typeof input.accountId === 'string' ? input.accountId : ''
  if (!UUID_PATTERN.test(flowId) || !/^\d{6,20}$/.test(accountId)) {
    return googleAdsJson({ error: 'invalid_request' }, 400)
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: flow, error: flowError } = await admin
    .from('ads_google_oauth_flows')
    .select('id,pending_refresh_token_enc,scopes,account_candidates,expires_at,status')
    .eq('id', flowId)
    .eq('user_id', userId)
    .eq('status', 'awaiting_account')
    .gt('expires_at', now)
    .maybeSingle()

  if (flowError) return googleAdsJson({ error: 'provider_error' }, 502)
  if (!flow || typeof flow.pending_refresh_token_enc !== 'string') {
    return googleAdsJson({ error: 'flow_expired' }, 404)
  }

  const account = safeCandidates(flow.account_candidates).find((candidate) => candidate.externalAccountId === accountId)
  if (!account) return googleAdsJson({ error: 'account_not_found' }, 404)
  if (account.isManager) return googleAdsJson({ error: 'manager_account' }, 400)
  if (!Array.isArray(flow.scopes) || !flow.scopes.includes(GOOGLE_ADS_SCOPE)) {
    return googleAdsJson({ error: 'scope_missing' }, 400)
  }

  let refreshToken: string
  try {
    const keyring = loadAdsTokenKeyring()
    refreshToken = decryptAdsToken(flow.pending_refresh_token_enc, googleOAuthTokenContext(userId, flowId), keyring)
  } catch {
    return googleAdsJson({ error: 'configuration_missing' }, 503)
  }

  const { data: consumed, error: consumeError } = await admin
    .from('ads_google_oauth_flows')
    .delete()
    .eq('id', flowId)
    .eq('user_id', userId)
    .eq('status', 'awaiting_account')
    .gt('expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle()

  if (consumeError) return googleAdsJson({ error: 'provider_error' }, 502)
  if (!consumed) return googleAdsJson({ error: 'flow_expired' }, 404)

  try {
    const connection = await saveGoogleAdsConnectionFromOAuth({
      userId,
      account,
      refreshToken,
      scopes: flow.scopes,
    })
    return googleAdsJson({ ok: true, connectionId: connection.id })
  } catch (error) {
    return googleAdsErrorResponse(error instanceof GoogleAdsError ? error : new GoogleAdsError('provider_error'))
  }
}
