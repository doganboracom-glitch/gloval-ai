import { checkRateLimit } from '@/lib/rate-limit'
import { logUserEvent } from '@/lib/notify'
import { buildMetaConnectedEmail } from '@/lib/email/ads-mail'
import { createAdminClient } from '@/lib/supabase/admin'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import type { MetaAdAccountCandidate, MetaInstagramAccount, MetaPageCandidate } from '@/lib/ads/meta-ads-shared'
import { saveMetaConnectionFromOAuth } from '@/lib/ads/meta-connections'
import { metaTokenContext } from '@/lib/ads/meta-oauth-state'
import { createConfiguredMetaProvider } from '@/lib/ads/meta-provider-factory'
import {
  META_UUID_PATTERN,
  isSameOriginMetaAdsPost,
  metaAdsErrorResponse,
  metaAdsFeatureEnabled,
  metaAdsJson,
  metaAdsKillSwitchActive,
  metaAdsRequestAccess,
} from '@/lib/ads/meta-route-utils'
import { decryptAdsToken, loadAdsTokenKeyring } from '@/lib/ads/token-crypto'

export const dynamic = 'force-dynamic'

const ACCOUNT_ID = /^act_\d{5,25}$/
const NUMERIC_ID = /^\d{1,30}$/

function str(value: unknown, max = 200): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null
}

export function safeAccountCandidates(value: unknown): MetaAdAccountCandidate[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const id = typeof row.externalAccountId === 'string' ? row.externalAccountId : ''
    if (!ACCOUNT_ID.test(id)) return []
    return [{
      externalAccountId: id,
      name: str(row.name, 120),
      currency: typeof row.currency === 'string' && /^[A-Z]{3}$/.test(row.currency) ? row.currency : null,
      accountStatus: typeof row.accountStatus === 'number' && Number.isInteger(row.accountStatus) ? row.accountStatus : null,
      businessId: typeof row.businessId === 'string' && NUMERIC_ID.test(row.businessId) ? row.businessId : null,
    }]
  })
}

export function safePageCandidates(value: unknown): MetaPageCandidate[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const pageId = typeof row.pageId === 'string' && NUMERIC_ID.test(row.pageId) ? row.pageId : ''
    if (!pageId) return []
    return [{
      pageId,
      pageName: str(row.pageName, 120),
    }]
  })
}

export async function GET(request: Request) {
  if (!metaAdsFeatureEnabled()) return metaAdsJson({ error: 'not_found' }, 404)
  const access = await metaAdsRequestAccess()
  if (!access) return metaAdsJson({ error: 'not_authenticated' }, 401)
  if (!access.decision.canConnect) return metaAdsJson({ error: 'not_found' }, 404)

  const flowId = new URL(request.url).searchParams.get('flowId') ?? ''
  if (!META_UUID_PATTERN.test(flowId)) return metaAdsJson({ error: 'invalid_request' }, 400)

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ads_meta_oauth_flows')
    .select('account_candidates,page_candidates')
    .eq('id', flowId)
    .eq('user_id', access.userId)
    .eq('status', 'awaiting_account')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) return metaAdsJson({ error: 'provider_error' }, 503)
  if (!data) return metaAdsJson({ error: 'flow_expired' }, 404)
  return metaAdsJson({
    accounts: safeAccountCandidates(data.account_candidates),
    pages: safePageCandidates(data.page_candidates),
  })
}

export async function POST(request: Request) {
  if (!metaAdsFeatureEnabled()) return metaAdsJson({ error: 'not_found' }, 404)
  if (!isSameOriginMetaAdsPost(request)) return metaAdsJson({ error: 'csrf_failed' }, 403)

  const access = await metaAdsRequestAccess()
  if (!access) return metaAdsJson({ error: 'not_authenticated' }, 401)
  if (!access.decision.canConnect) return metaAdsJson({ error: 'not_found' }, 404)
  if (metaAdsKillSwitchActive()) return metaAdsJson({ error: 'kill_switch_active' }, 503)
  const userId = access.userId
  if (!checkRateLimit(`meta-ads-select:${userId}`, 10, 60_000).allowed) return metaAdsJson({ error: 'rate_limited' }, 429)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return metaAdsJson({ error: 'invalid_request' }, 400)
  }
  if (!body || typeof body !== 'object') return metaAdsJson({ error: 'invalid_request' }, 400)
  const input = body as Record<string, unknown>
  const flowId = typeof input.flowId === 'string' ? input.flowId : ''
  const accountId = typeof input.accountId === 'string' ? input.accountId : ''
  const pageId = typeof input.pageId === 'string' && input.pageId ? input.pageId : null
  if (!META_UUID_PATTERN.test(flowId) || !ACCOUNT_ID.test(accountId) || (pageId && !NUMERIC_ID.test(pageId))) {
    return metaAdsJson({ error: 'invalid_request' }, 400)
  }

  const admin = createAdminClient()
  const { data: flow, error: flowError } = await admin
    .from('ads_meta_oauth_flows')
    .select('*')
    .eq('id', flowId)
    .eq('user_id', userId)
    .eq('status', 'awaiting_account')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (flowError) return metaAdsJson({ error: 'provider_error' }, 503)
  if (!flow || typeof flow.pending_token_enc !== 'string') return metaAdsJson({ error: 'flow_expired' }, 404)

  const account = safeAccountCandidates(flow.account_candidates).find((item) => item.externalAccountId === accountId)
  if (!account) return metaAdsJson({ error: 'account_not_found' }, 404)
  const page = pageId ? safePageCandidates(flow.page_candidates).find((item) => item.pageId === pageId) ?? null : null
  if (pageId && !page) return metaAdsJson({ error: 'invalid_request' }, 400)

  let accessToken: string
  try {
    accessToken = decryptAdsToken(flow.pending_token_enc, metaTokenContext(userId, flowId), loadAdsTokenKeyring())
  } catch {
    return metaAdsJson({ error: 'configuration_missing' }, 503)
  }

  // Claim the flow first so a double submit cannot create the connection twice.
  const { data: consumed, error: consumeError } = await admin
    .from('ads_meta_oauth_flows')
    .delete()
    .eq('id', flowId)
    .eq('user_id', userId)
    .eq('status', 'awaiting_account')
    .gt('expires_at', new Date().toISOString())
    .select('*')
    .maybeSingle()
  if (consumeError) return metaAdsJson({ error: 'provider_error' }, 503)
  if (!consumed) return metaAdsJson({ error: 'flow_expired' }, 404)

  // Instagram comes from the ad account's instagram_accounts edge (ads_read); no access just leaves it empty.
  let instagram: MetaInstagramAccount | null = null
  const configured = createConfiguredMetaProvider()
  if (configured.ok) {
    const accounts = await configured.provider
      .listInstagramAccounts({ accessToken, accountId, context: { userId, connectionId: null } })
      .catch(() => [])
    instagram = accounts[0] ?? null
  }

  try {
    const connection = await saveMetaConnectionFromOAuth({
      userId,
      account,
      page,
      instagram,
      accessToken,
      scopes: Array.isArray(flow.granted_scopes) ? flow.granted_scopes : [],
      tokenExpiresAt: typeof flow.pending_token_expires_at === 'string'
        ? flow.pending_token_expires_at
        : new Date(Date.now() + 60 * 86_400_000).toISOString(),
      metaUserId: typeof flow.pending_meta_user_id === 'string' ? flow.pending_meta_user_id : null,
    })
    try {
      const mail = buildMetaConnectedEmail({ accountName: account.name ?? account.externalAccountId })
      await logUserEvent({
        userId,
        type: 'meta_ads_connected',
        subject: mail.subject,
        body: mail.subject,
        userEmail: () => mail,
        dedupeKey: `meta_ads_connected_${connection.id}_${flowId}`,
      })
    } catch {
      console.error('[meta-ads] connected notification failed')
    }
    return metaAdsJson({ ok: true, connectionId: connection.id })
  } catch (error) {
    // Keep the encrypted token retryable until the flow expires; the expiry cron deletes leftovers.
    const { error: restoreError } = await admin.from('ads_meta_oauth_flows').insert(consumed)
    if (restoreError) console.error('[meta-ads] selection flow restore failed')
    return metaAdsErrorResponse(error instanceof MetaAdsError ? error : new MetaAdsError('provider_error'))
  }
}
