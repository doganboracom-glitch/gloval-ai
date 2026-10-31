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
  for (const candidate of connections) {
    const leaseId = randomUUID()
    let leaseAcquired = false
    try {
      await claimConnectionLease(admin, userId, candidate.id, leaseId, ['active', 'error', 'pending'])
      leaseAcquired = true
      const connection = await getGoogleAdsConnectionForUser(admin, userId, candidate.id)
      if (!connection) {
        failed = true
        continue
      }
      if (!connection.refresh_token_enc) continue

      const refreshToken = decryptAdsToken(
        connection.refresh_token_enc,
        connectionTokenContext(connection),
        keyring,
      )
      await revokeGoogleAdsRefreshToken(refreshToken)
      const { error: updateError } = await admin
        .from('ads_connections')
        .update({
          status: 'revoked',
          refresh_token_enc: null,
          last_error: null,
          api_lease_id: null,
          api_lease_expires_at: null,
        })
        .eq('id', connection.id)
        .eq('user_id', userId)
        .eq('api_lease_id', leaseId)
      if (updateError) failed = true
    } catch {
      const current = await getGoogleAdsConnectionForUser(admin, userId, candidate.id).catch(() => null)
      if (current?.status !== 'revoked' || current.refresh_token_enc) failed = true
    } finally {
      if (leaseAcquired) await releaseConnectionLease(admin, userId, candidate.id, leaseId)
    }
  }

  if (failed) throw new GoogleAdsError('disconnect_failed')
}

type GoogleAdsOAuthFlowRow = {
  id: string
  user_id: string
  state_hash: string
  code_verifier_enc: string | null
  pending_refresh_token_enc: string | null
  status: 'started' | 'exchanging' | 'awaiting_account'
  account_candidates: unknown
  scopes: string[]
  state_consumed_at: string | null
  expires_at: string
  created_at: string
}

function oauthFlowRestoreValues(
  flow: GoogleAdsOAuthFlowRow,
  accountCandidates: unknown,
) {
  return {
    id: flow.id,
    user_id: flow.user_id,
    state_hash: flow.state_hash,
    code_verifier_enc: null,
    pending_refresh_token_enc: flow.pending_refresh_token_enc,
    status: 'awaiting_account' as const,
    account_candidates: accountCandidates,
    scopes: flow.scopes,
    state_consumed_at: flow.state_consumed_at ?? new Date().toISOString(),
    expires_at: flow.expires_at,
    created_at: flow.created_at,
  }
}

async function restoreOAuthFlow(
  admin: ReturnType<typeof createAdminClient>,
  flow: GoogleAdsOAuthFlowRow,
  accountCandidates: unknown,
): Promise<boolean> {
  const { error } = await admin
    .from('ads_google_oauth_flows')
    .insert(oauthFlowRestoreValues(flow, accountCandidates))
  if (!error) return true
  console.error('[google-ads] OAuth flow restore failed', { flowId: flow.id })
  return false
}

export async function revokeGoogleAdsOAuthFlowsForDeletion(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<void> {
  const { data, error } = await admin
    .from('ads_google_oauth_flows')
    .select('*')
    .eq('user_id', userId)
    .not('pending_refresh_token_enc', 'is', null)

  if (error) throw new GoogleAdsError('disconnect_failed')
  const flows = (data ?? []) as GoogleAdsOAuthFlowRow[]
  if (flows.length === 0) return

  let keyring
  try {
    keyring = loadAdsTokenKeyring()
  } catch {
    throw new GoogleAdsError('configuration_missing')
  }

  let failed = false
  for (const flow of flows) {
    if (!flow.pending_refresh_token_enc) continue

    let refreshToken: string
    try {
      refreshToken = decryptAdsToken(
        flow.pending_refresh_token_enc,
        googleOAuthTokenContext(userId, flow.id),
        keyring,
      )
    } catch {
      failed = true
      continue
    }

    const { data: claimed, error: claimError } = await admin
      .from('ads_google_oauth_flows')
      .delete()
      .eq('id', flow.id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle()

    if (claimError) {
      failed = true
      continue
    }
    if (!claimed) continue

    try {
      await revokeGoogleAdsRefreshToken(refreshToken)
    } catch {
      failed = true
      await restoreOAuthFlow(admin, flow, [])
    }
  }

  if (failed) throw new GoogleAdsError('disconnect_failed')
}

export type ExpiredGoogleAdsOAuthCleanup = {
  flowsRemoved: number
  tokensRevoked: number
  ciphertextsCleared: number
  revokeFailures: number
}

export async function cleanupExpiredGoogleAdsOAuthFlows(
  admin: ReturnType<typeof createAdminClient>,
  now = new Date().toISOString(),
): Promise<ExpiredGoogleAdsOAuthCleanup> {
  const batchSize = 25
  const maxBatches = 200
  const totals: ExpiredGoogleAdsOAuthCleanup = {
    flowsRemoved: 0,
    tokensRevoked: 0,
    ciphertextsCleared: 0,
    revokeFailures: 0,
  }
  let keyring: ReturnType<typeof loadAdsTokenKeyring> | null | undefined

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const { data, error } = await admin
      .from('ads_google_oauth_flows')
      .select('id,user_id,pending_refresh_token_enc')
      .lt('expires_at', now)
      .not('pending_refresh_token_enc', 'is', null)
      .order('expires_at', { ascending: true })
      .limit(batchSize)

    if (error) throw new GoogleAdsError('provider_error')
    const flows = (data ?? []) as Array<Pick<GoogleAdsOAuthFlowRow, 'id' | 'user_id' | 'pending_refresh_token_enc'>>
    if (flows.length === 0) return totals

    if (keyring === undefined) {
      try {
        keyring = loadAdsTokenKeyring()
      } catch {
        keyring = null
      }
    }

    const outcomes = await Promise.all(flows.map(async (flow) => {
      let revoked = false
      if (flow.pending_refresh_token_enc && keyring) {
        try {
          const refreshToken = decryptAdsToken(
            flow.pending_refresh_token_enc,
            googleOAuthTokenContext(flow.user_id, flow.id),
            keyring,
          )
          await revokeGoogleAdsRefreshToken(refreshToken)
          revoked = true
        } catch {
          console.warn('[google-ads] expired OAuth token revoke failed', { flowId: flow.id })
        }
      } else {
        console.warn('[google-ads] expired OAuth token could not be decrypted', { flowId: flow.id })
      }

      const { data: removed, error: removeError } = await admin
        .from('ads_google_oauth_flows')
        .delete()
        .eq('id', flow.id)
        .eq('user_id', flow.user_id)
        .lt('expires_at', now)
        .select('id')
        .maybeSingle()

      if (removeError) throw new GoogleAdsError('provider_error')
      return { removed: Boolean(removed), revoked }
    }))

    for (const outcome of outcomes) {
      if (!outcome.removed) continue
      totals.flowsRemoved += 1
      totals.ciphertextsCleared += 1
      if (outcome.revoked) totals.tokensRevoked += 1
      else totals.revokeFailures += 1
    }

    if (flows.length < batchSize) return totals
  }

  const { data: remaining, error: remainingError } = await admin
    .from('ads_google_oauth_flows')
    .select('id')
    .lt('expires_at', now)
    .not('pending_refresh_token_enc', 'is', null)
    .limit(1)

  if (remainingError || (remaining?.length ?? 0) > 0) throw new GoogleAdsError('provider_error')
  return totals
}
