import 'server-only'

import { ADS_FREE_LIMITS } from '@/lib/ads/credit-costs'

/** Names of every GLOVAL Ads environment variable. Values are never logged. */
export const ADS_ENV = {
  featureUi: 'ADS_FEATURE_UI',
  tokenEncKeyPrefix: 'ADS_TOKEN_ENC_KEY_V',
  tokenEncActiveVersion: 'ADS_TOKEN_ENC_ACTIVE_VERSION',
  anonHashSecret: 'ADS_ANON_HASH_SECRET',
  anonDailyCap: 'ADS_ANON_DAILY_CAP',
  plannerModel: 'ADS_PLANNER_MODEL',
  previewModel: 'ADS_PREVIEW_MODEL',
  assistantModel: 'ADS_ASSISTANT_MODEL',
  googleAdsOAuthClientId: 'GOOGLE_ADS_OAUTH_CLIENT_ID',
  googleAdsOAuthClientSecret: 'GOOGLE_ADS_OAUTH_CLIENT_SECRET',
  googleAdsOAuthStateSecret: 'ADS_OAUTH_STATE_SECRET',
  googleAdsOAuthRedirectUri: 'GOOGLE_ADS_OAUTH_REDIRECT_URI',
  googleAdsConnectEnabled: 'ADS_GOOGLE_CONNECT_ENABLED',
  googleAdsConnectAllowedUserIds: 'ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS',
} as const

type Env = Readonly<Record<string, string | undefined>>

/** Global anonymous free-action ceiling per day. Invalid or missing values fall back to the default. */
export function resolveAnonDailyCap(env: Env = process.env): number {
  const raw = env[ADS_ENV.anonDailyCap]?.trim()
  if (!raw || !/^\d{1,6}$/.test(raw)) return ADS_FREE_LIMITS.anonGlobalPerDayDefault
  const value = Number(raw)
  return value >= 1 ? value : ADS_FREE_LIMITS.anonGlobalPerDayDefault
}

/**
 * Secret used to HMAC anonymous subjects (cookie id, IP) before they reach the
 * database. Dedicated on purpose: it is never shared with another feature's
 * secret. Returns null when missing so callers fail closed.
 */
export function resolveAnonHashSecret(env: Env = process.env): string | null {
  const value = env[ADS_ENV.anonHashSecret]
  return value && value.length >= 32 ? value : null
}

export type GoogleAdsOAuthSettings = {
  clientId: string
  clientSecret: string
  stateSecret: string
  redirectUri: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function resolveGoogleAdsConnectAccess(userId: string | null, env: Env = process.env): boolean {
  if (!userId || env[ADS_ENV.googleAdsConnectEnabled]?.trim() !== '1') return false
  const normalizedUserId = userId.trim().toLowerCase()
  if (!UUID_PATTERN.test(normalizedUserId)) return false

  const allowedUserIds = new Set(
    (env[ADS_ENV.googleAdsConnectAllowedUserIds] ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => UUID_PATTERN.test(value)),
  )
  return allowedUserIds.has(normalizedUserId)
}

export type GoogleAdsOAuthSettingsResult =
  | { ok: true; settings: GoogleAdsOAuthSettings }
  | { ok: false; reason: 'configuration_missing' | 'redirect_uri_invalid' }

const DEFAULT_GOOGLE_ADS_REDIRECT_URI = 'https://gloval.ai/api/ads/google/callback'
const GOOGLE_ADS_CALLBACK_PATH = '/api/ads/google/callback'

export function resolveGoogleAdsOAuthSettings(env: Env = process.env): GoogleAdsOAuthSettingsResult {
  const clientId = env[ADS_ENV.googleAdsOAuthClientId]?.trim()
  const clientSecret = env[ADS_ENV.googleAdsOAuthClientSecret]?.trim()
  const stateSecret = env[ADS_ENV.googleAdsOAuthStateSecret]
  if (!clientId || !clientSecret || !stateSecret || stateSecret.length < 32) {
    return { ok: false, reason: 'configuration_missing' }
  }

  const redirectUri = env[ADS_ENV.googleAdsOAuthRedirectUri]?.trim() || DEFAULT_GOOGLE_ADS_REDIRECT_URI
  try {
    const parsed = new URL(redirectUri)
    const localHttp = process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:' && parsed.hostname === 'localhost'
    if (
      (!localHttp && parsed.protocol !== 'https:') ||
      parsed.pathname !== GOOGLE_ADS_CALLBACK_PATH ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      return { ok: false, reason: 'redirect_uri_invalid' }
    }
  } catch {
    return { ok: false, reason: 'redirect_uri_invalid' }
  }

  return {
    ok: true,
    settings: {
      clientId,
      clientSecret,
      stateSecret,
      redirectUri,
    },
  }
}
