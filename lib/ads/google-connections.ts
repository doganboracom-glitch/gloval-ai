import 'server-only'

import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import {
  adsTokenNeedsRotation,
  decryptAdsToken,
  encryptAdsToken,
  loadAdsTokenKeyring,
} from '@/lib/ads/token-crypto'
import { revokeGoogleAdsRefreshToken } from '@/lib/ads/providers/google-ads-provider'
import type { AdsAccountSummary, AdsApiOperationContext, GoogleAdsProvider } from '@/lib/ads/providers/types'

export type GoogleAdsConnectionSummary = {
  id: string
  externalAccountId: string
  name: string | null
  currency: string | null
  isManager: boolean
  loginCustomerId: string | null
  status: 'pending' | 'active' | 'revoked' | 'error'
  lastError: string | null
  createdAt: string
}

export type GoogleAdsConnectionRow = {
  id: string
  user_id: string
  platform: string
  external_account_id: string
  external_account_name: string | null
  login_customer_id: string | null
  currency_code: string | null
  is_manager: boolean
  refresh_token_enc: string | null
  token_key_version: number
  scopes: string[]
  status: 'pending' | 'active' | 'revoked' | 'error'
  last_error: string | null
  api_lease_id: string | null
  api_lease_expires_at: string | null
  created_at: string
  updated_at: string
}

const CONNECTION_SELECT =
  'id,user_id,platform,external_account_id,external_account_name,login_customer_id,currency_code,is_manager,refresh_token_enc,token_key_version,scopes,status,last_error,api_lease_id,api_lease_expires_at,created_at,updated_at'

export function googleOAuthTokenContext(userId: string, flowId: string) {
  return { userId, platform: 'google_ads', externalAccountId: `oauth:${flowId}` }
}

export async function listGoogleAdsConnectionsForUser(userId: string): Promise<GoogleAdsConnectionSummary[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ads_connections')
    .select('id,external_account_id,external_account_name,currency_code,is_manager,login_customer_id,status,last_error,created_at')
    .eq('user_id', userId)
    .eq('platform', 'google_ads')
    .order('created_at', { ascending: false })

  if (error) throw new GoogleAdsError('provider_error')

  return (data ?? []).map((row) => ({
    id: row.id,
    externalAccountId: row.external_account_id,
    name: row.external_account_name,
    currency: row.currency_code,
    isManager: row.is_manager,
    loginCustomerId: row.login_customer_id,
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
  }))
}

export async function getGoogleAdsConnectionForUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  connectionId: string,
): Promise<GoogleAdsConnectionRow | null> {
  const { data, error } = await admin
    .from('ads_connections')
    .select(CONNECTION_SELECT)
    .eq('id', connectionId)
    .eq('user_id', userId)
    .eq('platform', 'google_ads')
    .maybeSingle()

  if (error) throw new GoogleAdsError('provider_error')
  return (data as GoogleAdsConnectionRow | null) ?? null
}

async function claimConnectionLease(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  connectionId: string,
  leaseId: string,
  statuses: Array<GoogleAdsConnectionRow['status']>,
): Promise<void> {
  const now = new Date()
  const nowIso = now.toISOString()
  const expiresAt = new Date(now.getTime() + 90_000).toISOString()
  const { data, error } = await admin
    .from('ads_connections')
    .update({ api_lease_id: leaseId, api_lease_expires_at: expiresAt })
    .eq('id', connectionId)
    .eq('user_id', userId)
    .eq('platform', 'google_ads')
    .in('status', statuses)
    .or(`api_lease_id.is.null,api_lease_expires_at.lte.${nowIso}`)
    .select('id')
    .maybeSingle()

  if (error) throw new GoogleAdsError('provider_error')
  if (data) return

  const existing = await getGoogleAdsConnectionForUser(admin, userId, connectionId)
  if (!existing) throw new GoogleAdsError('connection_not_found')
  if (!statuses.includes(existing.status)) throw new GoogleAdsError('reauth_required')
  throw new GoogleAdsError('connection_busy')
}

async function releaseConnectionLease(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  connectionId: string,
  leaseId: string,
): Promise<void> {
  const { error } = await admin
    .from('ads_connections')
    .update({ api_lease_id: null, api_lease_expires_at: null })
    .eq('id', connectionId)
    .eq('user_id', userId)
    .eq('api_lease_id', leaseId)

  if (error) console.error('[google-ads] lease release failed', { connectionId })
}

function connectionTokenContext(connection: GoogleAdsConnectionRow) {
  return {
    userId: connection.user_id,
    platform: 'google_ads',
    externalAccountId: connection.external_account_id,
  }
}

async function setReauthenticationRequired(
  admin: ReturnType<typeof createAdminClient>,
  connection: GoogleAdsConnectionRow,
  leaseId: string,
): Promise<void> {
  const { error } = await admin
    .from('ads_connections')
    .update({ status: 'error', refresh_token_enc: null, last_error: 'reauth_required' })
    .eq('id', connection.id)
    .eq('user_id', connection.user_id)
    .eq('api_lease_id', leaseId)

  if (error) console.error('[google-ads] reauth state update failed', { connectionId: connection.id })
}

export async function withGoogleAdsAccess<T>(input: {
  userId: string
  connectionId: string
  provider: GoogleAdsProvider
  action: (data: {
    connection: GoogleAdsConnectionRow
    accessToken: string
    context: AdsApiOperationContext
  }) => Promise<T>
}): Promise<T> {
  const admin = createAdminClient()
  const initial = await getGoogleAdsConnectionForUser(admin, input.userId, input.connectionId)
  if (!initial) throw new GoogleAdsError('connection_not_found')
  if (initial.status !== 'active' || !initial.refresh_token_enc) throw new GoogleAdsError('reauth_required')
  if (initial.is_manager) throw new GoogleAdsError('manager_account')

  const leaseId = randomUUID()
  await claimConnectionLease(admin, input.userId, input.connectionId, leaseId, ['active'])

  try {
    const connection = await getGoogleAdsConnectionForUser(admin, input.userId, input.connectionId)
    if (!connection || connection.status !== 'active' || !connection.refresh_token_enc) {
      throw new GoogleAdsError('reauth_required')
    }

    let keyring
    try {
      keyring = loadAdsTokenKeyring()
    } catch {
      throw new GoogleAdsError('configuration_missing')
    }

    let refreshToken: string
    try {
      refreshToken = decryptAdsToken(connection.refresh_token_enc, connectionTokenContext(connection), keyring)
    } catch {
      throw new GoogleAdsError('reauth_required')
    }

    let refreshed
    try {
      refreshed = await input.provider.refreshAccessTokenWithRotation(refreshToken)
    } catch (error) {
      if (error instanceof GoogleAdsError && error.code === 'reauth_required') {
        await setReauthenticationRequired(admin, connection, leaseId)
      }
      throw error
    }

    const nextRefreshToken = refreshed.refreshToken || refreshToken
    const tokenNeedsRotation = refreshed.refreshToken !== null || adsTokenNeedsRotation(connection.refresh_token_enc, keyring)
    const update: Record<string, unknown> = { last_error: null, status: 'active' }

    if (tokenNeedsRotation) {
      const encrypted = encryptAdsToken(nextRefreshToken, connectionTokenContext(connection), keyring)
      update.refresh_token_enc = encrypted.ciphertext
      update.token_key_version = encrypted.keyVersion
    }

    const { error } = await admin
      .from('ads_connections')
      .update(update)
      .eq('id', connection.id)
      .eq('user_id', input.userId)
      .eq('api_lease_id', leaseId)

    if (error) throw new GoogleAdsError('provider_error')

    return await input.action({
      connection,
      accessToken: refreshed.accessToken,
      context: { userId: input.userId, connectionId: connection.id },
    })
  } finally {
    await releaseConnectionLease(admin, input.userId, input.connectionId, leaseId)
  }
}

export async function saveGoogleAdsConnectionFromOAuth(input: {
  userId: string
  account: AdsAccountSummary
  refreshToken: string
  scopes: string[]
}): Promise<{ id: string }> {
  if (!/^\d{6,20}$/.test(input.account.externalAccountId) || input.account.isManager || !input.refreshToken) {
    throw new GoogleAdsError('invalid_request')
  }

  const admin = createAdminClient()
  const { data: existing, error: lookupError } = await admin
    .from('ads_connections')
    .select('id,api_lease_expires_at')
    .eq('user_id', input.userId)
    .eq('platform', 'google_ads')
    .eq('external_account_id', input.account.externalAccountId)
    .maybeSingle()
  if (lookupError) throw new GoogleAdsError('provider_error')
  if (existing?.api_lease_expires_at && new Date(existing.api_lease_expires_at).getTime() > Date.now()) {
    throw new GoogleAdsError('connection_busy')
  }

  let keyring
  try {
    keyring = loadAdsTokenKeyring()
  } catch {
    throw new GoogleAdsError('configuration_missing')
  }

  const encrypted = encryptAdsToken(
    input.refreshToken,
    {
      userId: input.userId,
      platform: 'google_ads',
      externalAccountId: input.account.externalAccountId,
    },
    keyring,
  )

  const { data, error } = await admin
    .from('ads_connections')
    .upsert(
      {
        user_id: input.userId,
        platform: 'google_ads',
        external_account_id: input.account.externalAccountId,
        external_account_name: input.account.name,
        currency_code: input.account.currency,
        is_manager: false,
        login_customer_id: input.account.loginCustomerId,
        refresh_token_enc: encrypted.ciphertext,
        token_key_version: encrypted.keyVersion,
        scopes: input.scopes,
        status: 'active',
        last_error: null,
      },
      { onConflict: 'user_id,platform,external_account_id' },
    )
    .select('id')
    .single()

  if (error || !data) throw new GoogleAdsError('provider_error')
  return { id: data.id }
}

export async function disconnectGoogleAdsConnection(userId: string, connectionId: string): Promise<void> {
  const admin = createAdminClient()
  const initial = await getGoogleAdsConnectionForUser(admin, userId, connectionId)
  if (!initial) throw new GoogleAdsError('connection_not_found')
  if (initial.status === 'revoked' && !initial.refresh_token_enc) return

  if (!initial.refresh_token_enc) {
    const { error } = await admin
      .from('ads_connections')
      .update({ status: 'revoked', last_error: null })
      .eq('id', connectionId)
      .eq('user_id', userId)
    if (error) throw new GoogleAdsError('disconnect_failed')
    return
  }

  const leaseId = randomUUID()
  await claimConnectionLease(admin, userId, connectionId, leaseId, ['active', 'error'])

  try {
    const connection = await getGoogleAdsConnectionForUser(admin, userId, connectionId)
    if (!connection || !connection.refresh_token_enc) throw new GoogleAdsError('disconnect_failed')

    let keyring
    try {
      keyring = loadAdsTokenKeyring()
    } catch {
      throw new GoogleAdsError('configuration_missing')
    }

    let refreshToken: string
    try {
      refreshToken = decryptAdsToken(connection.refresh_token_enc, connectionTokenContext(connection), keyring)
    } catch {
      throw new GoogleAdsError('disconnect_failed')
    }

    await revokeGoogleAdsRefreshToken(refreshToken)
    const { error } = await admin
      .from('ads_connections')
      .update({
        refresh_token_enc: null,
        status: 'revoked',
        last_error: null,
        api_lease_id: null,
        api_lease_expires_at: null,
      })
      .eq('id', connectionId)
      .eq('user_id', userId)
      .eq('api_lease_id', leaseId)

    if (error) throw new GoogleAdsError('disconnect_failed')
  } finally {
    await releaseConnectionLease(admin, userId, connectionId, leaseId)
  }
}

export async function revokeGoogleAdsConnectionsForDeletion(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<void> {
  const { data, error } = await admin
    .from('ads_connections')
    .select(CONNECTION_SELECT)
    .eq('user_id', userId)
    .eq('platform', 'google_ads')
    .not('refresh_token_enc', 'is', null)

  if (error) throw new GoogleAdsError('disconnect_failed')
  const connections = (data ?? []) as GoogleAdsConnectionRow[]
  if (connections.length === 0) return

  let keyring
  try {
    keyring = loadAdsTokenKeyring()
  } catch {
    throw new GoogleAdsError('configuration_missing')
  }

  let failed = false
  for (const connection of connections) {
    if (!connection.refresh_token_enc) continue
    try {
      const refreshToken = decryptAdsToken(
        connection.refresh_token_enc,
        connectionTokenContext(connection),
        keyring,
      )
      await revokeGoogleAdsRefreshToken(refreshToken)
      const { error: updateError } = await admin
        .from('ads_connections')
        .update({ status: 'revoked', refresh_token_enc: null, last_error: null })
        .eq('id', connection.id)
        .eq('user_id', userId)
      if (updateError) failed = true
    } catch {
      failed = true
    }
  }

  if (failed) throw new GoogleAdsError('disconnect_failed')
}
