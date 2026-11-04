import 'server-only'

import { ADS_FREE_LIMITS } from '@/lib/ads/credit-costs'
import { ADS_POLICY_BLOCK_LIMITS } from '@/lib/ads/policy-constants'

/** Names of every GLOVAL Ads environment variable. Values are never logged. */
export const ADS_ENV = {
  featureUi: 'ADS_FEATURE_UI',
  tokenEncKeyPrefix: 'ADS_TOKEN_ENC_KEY_V',
  tokenEncActiveVersion: 'ADS_TOKEN_ENC_ACTIVE_VERSION',
  anonHashSecret: 'ADS_ANON_HASH_SECRET',
  anonDailyCap: 'ADS_ANON_DAILY_CAP',
  policyBlockGlobalDailyCap: 'ADS_POLICY_BLOCK_GLOBAL_DAILY_CAP',
  plannerModel: 'ADS_PLANNER_MODEL',
  previewModel: 'ADS_PREVIEW_MODEL',
  assistantModel: 'ADS_ASSISTANT_MODEL',
  googleAdsOAuthClientId: 'GOOGLE_ADS_OAUTH_CLIENT_ID',
  googleAdsOAuthClientSecret: 'GOOGLE_ADS_OAUTH_CLIENT_SECRET',
  googleAdsOAuthStateSecret: 'ADS_OAUTH_STATE_SECRET',
  googleAdsOAuthRedirectUri: 'GOOGLE_ADS_OAUTH_REDIRECT_URI',
  googleAdsConnectEnabled: 'ADS_GOOGLE_CONNECT_ENABLED',
  googleAdsConnectPublic: 'ADS_GOOGLE_CONNECT_PUBLIC',
  googleAdsConnectAllowedUserIds: 'ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS',
  googleAdsMaxActiveConnections: 'ADS_GOOGLE_CONNECT_MAX_ACTIVE_CONNECTIONS',
  googleAdsReadDailyUserLimit: 'ADS_GOOGLE_READ_DAILY_USER_LIMIT',
  googleAdsReadDailyGlobalLimit: 'ADS_GOOGLE_READ_DAILY_GLOBAL_LIMIT',
  googleAdsPublishEnabled: 'GOOGLE_ADS_PUBLISH_ENABLED',
  googleAdsPublishAllowedUserIds: 'GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS',
  googleAdsPublishDailyBudgetCapsMinor: 'GOOGLE_ADS_PUBLISH_DAILY_BUDGET_CAPS_MINOR',
} as const

type Env = Readonly<Record<string, string | undefined>>

/** Global anonymous free-action ceiling per day. Invalid or missing values fall back to the default. */
export function resolveAnonDailyCap(env: Env = process.env): number {
  const raw = env[ADS_ENV.anonDailyCap]?.trim()
  if (!raw || !/^\d{1,6}$/.test(raw)) return ADS_FREE_LIMITS.anonGlobalPerDayDefault
  const value = Number(raw)
  return value >= 1 ? value : ADS_FREE_LIMITS.anonGlobalPerDayDefault
}

/** Global daily ceiling on explicit model-confirmed policy-block attempts. */
export function resolvePolicyBlockGlobalDailyCap(env: Env = process.env): number {
  const raw = env[ADS_ENV.policyBlockGlobalDailyCap]?.trim()
  if (!raw || !/^\d{1,6}$/.test(raw)) return ADS_POLICY_BLOCK_LIMITS.globalPerDayDefault
  const value = Number(raw)
  return value >= 1 ? value : ADS_POLICY_BLOCK_LIMITS.globalPerDayDefault
}

/**
 * Secret used to HMAC anonymous quota subjects and policy-block identity/IP
 * counters before they reach storage. Dedicated to Ads; callers fail closed
 * when it is missing.
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

export function isGoogleAdsConnectPublic(env: Env = process.env): boolean {
  return env[ADS_ENV.googleAdsConnectEnabled]?.trim() === '1'
    && env[ADS_ENV.googleAdsConnectPublic]?.trim() === '1'
}

export function resolveGoogleAdsConnectAccess(userId: string | null, env: Env = process.env): boolean {
  if (!userId || env[ADS_ENV.googleAdsConnectEnabled]?.trim() !== '1') return false
  const normalizedUserId = userId.trim().toLowerCase()
  if (!UUID_PATTERN.test(normalizedUserId)) return false
  if (env[ADS_ENV.googleAdsConnectPublic]?.trim() === '1') return true

  const allowedUserIds = new Set(
    (env[ADS_ENV.googleAdsConnectAllowedUserIds] ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => UUID_PATTERN.test(value)),
  )
  return allowedUserIds.has(normalizedUserId)
}

const GOOGLE_ADS_EXPLORER_DAILY_QUOTA_MAX = 2_879
const GOOGLE_ADS_CONNECT_MAX_ACTIVE_DEFAULT = 3
const GOOGLE_ADS_READ_DAILY_USER_DEFAULT = 200
const GOOGLE_ADS_READ_DAILY_GLOBAL_DEFAULT = 2_000

function resolvePositiveLimit(raw: string | undefined, fallback: number, max: number): number {
  const value = raw?.trim()
  if (!value || !/^\d{1,6}$/.test(value)) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : fallback
}

export function resolveGoogleAdsMaxActiveConnections(env: Env = process.env): number {
  return resolvePositiveLimit(
    env[ADS_ENV.googleAdsMaxActiveConnections],
    GOOGLE_ADS_CONNECT_MAX_ACTIVE_DEFAULT,
    100,
  )
}

export function resolveGoogleAdsReadDailyLimits(env: Env = process.env): { perUser: number; global: number } {
  return {
    perUser: resolvePositiveLimit(
      env[ADS_ENV.googleAdsReadDailyUserLimit],
      GOOGLE_ADS_READ_DAILY_USER_DEFAULT,
      GOOGLE_ADS_EXPLORER_DAILY_QUOTA_MAX,
    ),
    global: resolvePositiveLimit(
      env[ADS_ENV.googleAdsReadDailyGlobalLimit],
      GOOGLE_ADS_READ_DAILY_GLOBAL_DEFAULT,
      GOOGLE_ADS_EXPLORER_DAILY_QUOTA_MAX,
    ),
  }
}

export function resolveGoogleAdsPublishAccess(userId: string | null, env: Env = process.env): boolean {
  if (!userId || env[ADS_ENV.googleAdsPublishEnabled]?.trim() !== '1') return false
  const normalizedUserId = userId.trim().toLowerCase()
  if (!UUID_PATTERN.test(normalizedUserId)) return false

  const allowedUserIds = new Set(
    (env[ADS_ENV.googleAdsPublishAllowedUserIds] ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => UUID_PATTERN.test(value)),
  )
  return allowedUserIds.has(normalizedUserId)
}

/** Fail closed until an explicit per-currency daily budget cap is configured. */
export function resolveGoogleAdsPublishDailyBudgetCapMinor(
  currency: string,
  env: Env = process.env,
): number | null {
  if (!/^[A-Z]{3}$/.test(currency)) return null
  const raw = env[ADS_ENV.googleAdsPublishDailyBudgetCapsMinor]?.trim()
  if (!raw || raw.length > 400) return null

  const caps = new Map<string, number>()
  for (const entry of raw.split(',')) {
    const match = /^([A-Z]{3})=(\d{1,12})$/.exec(entry.trim())
    if (!match) return null
    const amount = Number(match[2])
    if (!Number.isSafeInteger(amount) || amount <= 0 || caps.has(match[1])) return null
    caps.set(match[1], amount)
  }
  return caps.get(currency) ?? null
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
