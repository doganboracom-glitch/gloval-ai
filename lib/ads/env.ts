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
  googleAdsDeveloperToken: 'GOOGLE_ADS_DEVELOPER_TOKEN',
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
  developerToken?: string
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

  const developerToken = env[ADS_ENV.googleAdsDeveloperToken]?.trim()
  return {
    ok: true,
    settings: {
      clientId,
      clientSecret,
      stateSecret,
      redirectUri,
      ...(developerToken ? { developerToken } : {}),
    },
  }
}
