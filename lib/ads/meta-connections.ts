import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { META_MAX_ACTIVE_CONNECTIONS } from '@/lib/ads/env'
import { MetaAdsError, isMetaAdsError } from '@/lib/ads/meta-ads-error'
import type { MetaApiContext } from '@/lib/ads/meta-api-client'
import { missingMetaOptionalScopes, missingMetaPublishScopes } from '@/lib/ads/meta-ads-shared'
import type {
  MetaAdAccountCandidate,
  MetaConnectionView,
  MetaInstagramAccount,
  MetaPageCandidate,
} from '@/lib/ads/meta-ads-shared'
import { decryptAdsToken, encryptAdsToken, loadAdsTokenKeyring } from '@/lib/ads/token-crypto'
import type { MetaAdsProvider } from '@/lib/ads/providers/meta-ads-provider'

export type MetaConnectionRow = {
  id: string
  user_id: string
  platform: string
  external_account_id: string
  external_account_name: string | null
  currency_code: string | null
  refresh_token_enc: string | null
  token_key_version: number
  scopes: string[]
  status: 'pending' | 'active' | 'revoked' | 'error'
  last_error: string | null
  token_expires_at: string | null
  meta_user_id: string | null
  meta_business_id: string | null
  page_id: string | null
  page_name: string | null
  instagram_account_id: string | null
  instagram_account_name: string | null
  account_status: number | null
  created_at: string
}

const CONNECTION_SELECT =
  'id,user_id,platform,external_account_id,external_account_name,currency_code,refresh_token_enc,token_key_version,scopes,status,last_error,token_expires_at,meta_user_id,meta_business_id,page_id,page_name,instagram_account_id,instagram_account_name,account_status,created_at'

type AdminClient = ReturnType<typeof createAdminClient>

export function metaConnectionTokenContext(connection: { user_id: string; external_account_id: string }) {
  return { userId: connection.user_id, platform: 'meta', externalAccountId: connection.external_account_id }
}

export function toMetaConnectionView(row: MetaConnectionRow): MetaConnectionView {
  return {
    id: row.id,
    externalAccountId: row.external_account_id,
    name: row.external_account_name,
    currency: row.currency_code,
    status: row.status === 'active' || row.status === 'error' ? row.status : 'revoked',
    lastError: row.last_error,
    createdAt: row.created_at,
    tokenExpiresAt: row.token_expires_at,
    pageName: row.page_name,
    instagramAccountName: row.instagram_account_name,
    accountStatus: row.account_status,
    missingOptionalScopes: missingMetaOptionalScopes(Array.isArray(row.scopes) ? row.scopes : []),
    missingPublishScopes: missingMetaPublishScopes(Array.isArray(row.scopes) ? row.scopes : []),
    hasPage: Boolean(row.page_id),
    hasInstagram: Boolean(row.instagram_account_id),
  }
}

export async function listMetaConnectionsForUser(userId: string): Promise<MetaConnectionView[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ads_connections')
    .select(CONNECTION_SELECT)
    .eq('user_id', userId)
    .eq('platform', 'meta')
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })
  if (error) throw new MetaAdsError('provider_error')
  return ((data ?? []) as MetaConnectionRow[]).map(toMetaConnectionView)
}

export async function getMetaConnectionForUser(
  admin: AdminClient,
  userId: string,
  connectionId: string,
): Promise<MetaConnectionRow | null> {
  const { data, error } = await admin
    .from('ads_connections')
    .select(CONNECTION_SELECT)
    .eq('id', connectionId)
    .eq('user_id', userId)
    .eq('platform', 'meta')
    .maybeSingle()
  if (error) throw new MetaAdsError('provider_error')
  return (data as MetaConnectionRow | null) ?? null
}

async function markReauthRequired(admin: AdminClient, connection: MetaConnectionRow, lastError: string) {
  const { error } = await admin
    .from('ads_connections')
    .update({ status: 'error', refresh_token_enc: null, last_error: lastError })
    .eq('id', connection.id)
    .eq('user_id', connection.user_id)
  if (error) console.error('[meta-ads] reauth state update failed')
}

/**
 * Decrypts the stored long-lived token for one read action. A token past its expiry, or one Meta rejects with
 * `reauth_required`, flips the connection to `error` so the UI asks the owner to reconnect.
 */
export async function withMetaAccess<T>(input: {
  userId: string
  connectionId: string
  now?: number
  action: (data: { connection: MetaConnectionRow; accessToken: string; context: MetaApiContext }) => Promise<T>
}): Promise<T> {
  const admin = createAdminClient()
  const connection = await getMetaConnectionForUser(admin, input.userId, input.connectionId)
  if (!connection) throw new MetaAdsError('connection_not_found')
  if (connection.status !== 'active' || !connection.refresh_token_enc) throw new MetaAdsError('reauth_required')

  const now = input.now ?? Date.now()
  if (connection.token_expires_at && Date.parse(connection.token_expires_at) <= now) {
    await markReauthRequired(admin, connection, 'token_expired')
    throw new MetaAdsError('token_expired')
  }

  let keyring
  try {
    keyring = loadAdsTokenKeyring()
  } catch {
    throw new MetaAdsError('configuration_missing')
  }

  let accessToken: string
  try {
    accessToken = decryptAdsToken(connection.refresh_token_enc, metaConnectionTokenContext(connection), keyring)
  } catch {
    throw new MetaAdsError('reauth_required')
  }

  try {
    return await input.action({
      connection,
      accessToken,
      context: { userId: input.userId, connectionId: connection.id },
    })
  } catch (error) {
    if (isMetaAdsError(error) && error.code === 'reauth_required') {
      await markReauthRequired(admin, connection, 'reauth_required')
    }
    throw error
  }
}

export async function saveMetaConnectionFromOAuth(input: {
  userId: string
  account: MetaAdAccountCandidate
  page: MetaPageCandidate | null
  instagram?: MetaInstagramAccount | null
  accessToken: string
  scopes: string[]
  tokenExpiresAt: string
  metaUserId: string | null
}): Promise<{ id: string }> {
  if (!/^act_\d{5,25}$/.test(input.account.externalAccountId) || !input.accessToken) {
    throw new MetaAdsError('invalid_request')
  }
  let keyring
  try {
    keyring = loadAdsTokenKeyring()
  } catch {
    throw new MetaAdsError('configuration_missing')
  }
  const encrypted = encryptAdsToken(
    input.accessToken,
    { userId: input.userId, platform: 'meta', externalAccountId: input.account.externalAccountId },
    keyring,
  )

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('ads_save_meta_connection_with_limit', {
    p_user_id: input.userId,
    p_external_account_id: input.account.externalAccountId,
    p_external_account_name: input.account.name,
    p_currency_code: input.account.currency,
    p_token_enc: encrypted.ciphertext,
    p_token_key_version: encrypted.keyVersion,
    p_scopes: input.scopes,
    p_token_expires_at: input.tokenExpiresAt,
    p_meta_user_id: input.metaUserId,
    p_meta_business_id: input.account.businessId,
    p_page_id: input.page?.pageId ?? null,
    p_page_name: input.page?.pageName ?? null,
    p_instagram_account_id: input.instagram?.id ?? null,
    p_instagram_account_name: input.instagram?.username ?? null,
    p_account_status: input.account.accountStatus,
    p_max_active_connections: META_MAX_ACTIVE_CONNECTIONS,
  })
  if (error) throw new MetaAdsError('quota_check_failed')

  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row.allowed !== 'boolean') throw new MetaAdsError('provider_error')
  if (!row.allowed) {
    throw new MetaAdsError(row.error_code === 'connection_limit_exceeded' ? 'connection_limit_exceeded' : 'provider_error')
  }
  if (typeof row.connection_id !== 'string') throw new MetaAdsError('provider_error')
  return { id: row.connection_id }
}

/** Best-effort remote revoke, then the local token is always dropped. */
export async function disconnectMetaConnection(input: {
  userId: string
  connectionId: string
  provider: MetaAdsProvider
}): Promise<void> {
  const admin = createAdminClient()
  const connection = await getMetaConnectionForUser(admin, input.userId, input.connectionId)
  if (!connection) throw new MetaAdsError('connection_not_found')
  if (connection.status === 'revoked' && !connection.refresh_token_enc) return

  if (connection.refresh_token_enc) {
    try {
      const keyring = loadAdsTokenKeyring()
      const accessToken = decryptAdsToken(connection.refresh_token_enc, metaConnectionTokenContext(connection), keyring)
      await input.provider.revokePermissions({
        accessToken,
        context: { userId: input.userId, connectionId: connection.id },
      })
    } catch {
      console.error('[meta-ads] remote permission revoke failed; local token removed anyway')
    }
  }

  const { error } = await admin
    .from('ads_connections')
    .update({ refresh_token_enc: null, token_expires_at: null, status: 'revoked', last_error: null })
    .eq('id', connection.id)
    .eq('user_id', input.userId)
  if (error) throw new MetaAdsError('disconnect_failed')
}

/** Meta deauthorize / data-deletion callbacks: revoke every connection of one Meta user. */
export async function revokeMetaConnectionsForMetaUser(
  metaUserId: string,
  confirmationCode: string | null,
): Promise<number> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('ads_revoke_meta_user_connections', {
    p_meta_user_id: metaUserId,
    p_confirmation_code: confirmationCode,
  })
  if (error) throw new MetaAdsError('disconnect_failed')
  return typeof data === 'number' ? data : 0
}

export type ExpiringMetaConnection = {
  id: string
  userId: string
  accountName: string | null
  externalAccountId: string
  tokenExpiresAt: string
  status: 'active' | 'error'
}

/** Active connections whose token ends within `withinDays` (already expired ones included, for the expired mail). */
export async function listMetaConnectionsNearExpiry(
  admin: AdminClient,
  withinDays: number,
  now = Date.now(),
): Promise<ExpiringMetaConnection[]> {
  const horizon = new Date(now + withinDays * 86_400_000).toISOString()
  const { data, error } = await admin
    .from('ads_connections')
    .select('id,user_id,external_account_name,external_account_id,token_expires_at,status')
    .eq('platform', 'meta')
    .in('status', ['active', 'error'])
    .not('token_expires_at', 'is', null)
    .lte('token_expires_at', horizon)
  if (error) throw new MetaAdsError('provider_error')
  return (data ?? []).flatMap((row) =>
    typeof row.token_expires_at === 'string'
      ? [{
          id: row.id as string,
          userId: row.user_id as string,
          accountName: (row.external_account_name as string | null) ?? null,
          externalAccountId: row.external_account_id as string,
          tokenExpiresAt: row.token_expires_at,
          status: row.status === 'error' ? 'error' as const : 'active' as const,
        }]
      : [],
  )
}
