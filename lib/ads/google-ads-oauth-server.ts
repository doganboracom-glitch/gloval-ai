import 'server-only'

import { createHash, createHmac, randomBytes } from 'node:crypto'
import { AdsProviderError } from '@/lib/ads/providers/types'
import { createGoogleAdsApiRequestWrapper } from '@/lib/ads/google-ads-operations'
import {
  revokeAndDeletePendingGoogleAdsFlows,
  scrubAndDeleteExpiredGoogleAdsFlows,
  type ExpiredGoogleAdsOAuthFlow,
  type PendingGoogleAdsOAuthFlow,
} from '@/lib/ads/google-ads-flow-cleanup'
import { createGoogleAdsProvider, type GoogleAdsProviderConfig } from '@/lib/ads/providers/google-ads-provider'
import { decryptAdsToken, encryptAdsToken, loadAdsTokenKeyring } from '@/lib/ads/token-crypto'
import type { Admin } from '@/lib/external-cleanup'

export const GOOGLE_ADS_OAUTH_FLOW_TTL_MS = 15 * 60 * 1000
const FLOW_TOKEN_PREFIX = 'oauth-flow:'
const EXPIRED_FLOW_BATCH_SIZE = 100
const MAX_EXPIRED_FLOW_BATCHES = 20

export type GoogleAdsOAuthFlowRow = {
  id: string
  user_id: string
  state_hash: string
  code_verifier_enc: string | null
  pending_refresh_token_enc: string | null
  token_key_version: number
  account_candidates: unknown
  status: 'started' | 'exchanging' | 'awaiting_account' | 'completed'
  state_consumed_at: string | null
  expires_at: string
}

export function hasGoogleAdsOAuthConfiguration(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return Boolean(env.GOOGLE_ADS_OAUTH_CLIENT_ID?.trim() && env.GOOGLE_ADS_OAUTH_CLIENT_SECRET?.trim())
}

export function createGoogleAdsProviderFromEnv(
  withApiRequest?: GoogleAdsProviderConfig['withApiRequest'],
): ReturnType<typeof createGoogleAdsProvider> {
  return createGoogleAdsProvider({
    clientId: process.env.GOOGLE_ADS_OAUTH_CLIENT_ID?.trim() ?? '',
    clientSecret: process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET?.trim() ?? '',
    withApiRequest,
  })
}

export function createGoogleAdsProviderForUser(
  admin: Admin,
  userId: string,
  connectionId: string | null = null,
): ReturnType<typeof createGoogleAdsProvider> {
  return createGoogleAdsProviderFromEnv(createGoogleAdsApiRequestWrapper(admin, userId, connectionId))
}

export function createGoogleAdsOAuthArtifacts(stateSecret: string): {
  state: string
  stateHash: string
  codeVerifier: string
  codeChallenge: string
} {
  if (stateSecret.trim().length < 32) throw new AdsProviderError('invalid_input', 'OAuth state secret is unavailable')

  const state = randomBytes(32).toString('base64url')
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  const stateHash = createHmac('sha256', stateSecret).update(state).digest('hex')

  return { state, stateHash, codeVerifier, codeChallenge }
}

export function hashGoogleAdsOAuthState(state: string, stateSecret: string): string {
  return createHmac('sha256', stateSecret).update(state).digest('hex')
}

export function googleAdsOAuthFlowTokenContext(userId: string, flowId: string) {
  return {
    userId,
    platform: 'google_ads',
    externalAccountId: `${FLOW_TOKEN_PREFIX}${flowId}`,
  }
}

export function encryptGoogleAdsOAuthFlowSecret(value: string, userId: string, flowId: string) {
  return encryptAdsToken(value, googleAdsOAuthFlowTokenContext(userId, flowId), loadAdsTokenKeyring())
}

export function decryptGoogleAdsOAuthFlowSecret(ciphertext: string, userId: string, flowId: string): string {
  return decryptAdsToken(ciphertext, googleAdsOAuthFlowTokenContext(userId, flowId), loadAdsTokenKeyring())
}

export async function retireGoogleAdsOAuthFlow(admin: Admin, userId: string, flowId: string): Promise<void> {
  const { error: deleteError } = await admin
    .from('ads_google_oauth_flows')
    .delete()
    .eq('id', flowId)
    .eq('user_id', userId)

  if (!deleteError) return

  const { error: scrubError } = await admin
    .from('ads_google_oauth_flows')
    .update({
      status: 'completed',
      state_consumed_at: new Date().toISOString(),
      pending_refresh_token_enc: null,
      code_verifier_enc: null,
      account_candidates: [],
    })
    .eq('id', flowId)
    .eq('user_id', userId)

  if (scrubError) throw new Error('Google Ads OAuth flow could not be retired safely')
}

export async function revokePendingGoogleAdsOAuthFlows(admin: Admin, userId: string): Promise<void> {
  const { data, error } = await admin
    .from('ads_google_oauth_flows')
    .select('id,user_id,pending_refresh_token_enc')
    .eq('user_id', userId)
    .eq('status', 'awaiting_account')
    .not('pending_refresh_token_enc', 'is', null)

  if (error) throw new Error('Google Ads OAuth token lookup failed')

  const rows = (data ?? []) as Array<{
    id: string
    user_id: string
    pending_refresh_token_enc: string
  }>
  if (rows.length === 0) return

  const provider = createGoogleAdsProviderFromEnv()
  const keyring = loadAdsTokenKeyring()
  const flows: PendingGoogleAdsOAuthFlow[] = rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    encryptedRefreshToken: row.pending_refresh_token_enc,
  }))

  await revokeAndDeletePendingGoogleAdsFlows(flows, {
    decrypt: (flow) =>
      decryptAdsToken(
        flow.encryptedRefreshToken,
        googleAdsOAuthFlowTokenContext(flow.userId, flow.id),
        keyring,
      ),
    revoke: (refreshToken) => provider.revoke(refreshToken),
    deleteFlow: async (flow) => {
      const { error: deleteError } = await admin
        .from('ads_google_oauth_flows')
        .delete()
        .eq('id', flow.id)
        .eq('user_id', userId)

      if (deleteError) throw new Error('Google Ads OAuth flow cleanup failed')
    },
  })
}

export async function purgeExpiredGoogleAdsOAuthFlows(
  admin: Admin,
  now = new Date(),
): Promise<{ revoked: number; scrubbed: number; deleted: number; pending: boolean }> {
  const cutoff = now.toISOString()
  const provider = createGoogleAdsProviderFromEnv()
  let keyring: ReturnType<typeof loadAdsTokenKeyring> | null = null
  let revoked = 0
  let scrubbed = 0
  let deleted = 0
  let pending = false

  for (let batchNumber = 0; batchNumber < MAX_EXPIRED_FLOW_BATCHES; batchNumber += 1) {
    const { data, error } = await admin
      .from('ads_google_oauth_flows')
      .select('id,user_id,pending_refresh_token_enc')
      .eq('status', 'awaiting_account')
      .lte('expires_at', cutoff)
      .not('pending_refresh_token_enc', 'is', null)
      .order('expires_at', { ascending: true })
      .limit(EXPIRED_FLOW_BATCH_SIZE)

    if (error) throw new Error('Expired Google Ads OAuth flows could not be read')

    const rows = (data ?? []) as Array<{
      id: string
      user_id: string
      pending_refresh_token_enc: string
    }>
    if (rows.length === 0) break

    const flows: ExpiredGoogleAdsOAuthFlow[] = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      encryptedRefreshToken: row.pending_refresh_token_enc,
    }))

    const batch = await scrubAndDeleteExpiredGoogleAdsFlows(flows, {
      decrypt: (flow) => {
        keyring ??= loadAdsTokenKeyring()
        return decryptAdsToken(
          flow.encryptedRefreshToken,
          googleAdsOAuthFlowTokenContext(flow.userId, flow.id),
          keyring,
        )
      },
      revoke: (refreshToken) => provider.revoke(refreshToken),
      scrub: async (flow) => {
        const { error: scrubError } = await admin
          .from('ads_google_oauth_flows')
          .update({
            status: 'completed',
            pending_refresh_token_enc: null,
            code_verifier_enc: null,
            account_candidates: [],
          })
          .eq('id', flow.id)
          .eq('user_id', flow.userId)
          .eq('status', 'awaiting_account')
          .eq('pending_refresh_token_enc', flow.encryptedRefreshToken)

        if (scrubError) throw new Error('Expired Google Ads OAuth token could not be scrubbed')
      },
      deleteFlow: async (flow) => {
        const { error: deleteError } = await admin
          .from('ads_google_oauth_flows')
          .delete()
          .eq('id', flow.id)
          .eq('user_id', flow.userId)
          .eq('status', 'completed')
          .is('pending_refresh_token_enc', null)

        if (deleteError) throw new Error('Expired Google Ads OAuth flow could not be deleted')
      },
    })

    revoked += batch.revoked
    scrubbed += batch.scrubbed
    deleted += batch.deleted
    if (rows.length < EXPIRED_FLOW_BATCH_SIZE) break
    if (batchNumber === MAX_EXPIRED_FLOW_BATCHES - 1) pending = true
  }

  const { data: tokenlessFlows, error: tokenlessDeleteError } = await admin
    .from('ads_google_oauth_flows')
    .delete()
    .lte('expires_at', cutoff)
    .is('pending_refresh_token_enc', null)
    .select('id')

  if (tokenlessDeleteError) throw new Error('Expired tokenless Google Ads OAuth flows could not be deleted')
  deleted += tokenlessFlows?.length ?? 0

  if (scrubbed > 0) {
    console.warn('[ads-purge] expired Google Ads refresh tokens were scrubbed after revoke failure', { scrubbed })
  }

  return { revoked, scrubbed, deleted, pending }
}
