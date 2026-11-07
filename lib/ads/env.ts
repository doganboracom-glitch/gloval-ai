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
  googleAdsAccessMode: 'GOOGLE_ADS_ACCESS_MODE',
  googleAdsKillSwitch: 'GOOGLE_ADS_KILL_SWITCH',
  googleAdsPublishDailyUserLimit: 'GOOGLE_ADS_PUBLISH_DAILY_USER_LIMIT',
  googleAdsPublishDailyGlobalLimit: 'GOOGLE_ADS_PUBLISH_DAILY_GLOBAL_LIMIT',
  googleAdsConnectEnabled: 'ADS_GOOGLE_CONNECT_ENABLED',
  googleAdsConnectPublic: 'ADS_GOOGLE_CONNECT_PUBLIC',
  googleAdsConnectAllowedUserIds: 'ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS',
  googleAdsMaxActiveConnections: 'ADS_GOOGLE_CONNECT_MAX_ACTIVE_CONNECTIONS',
  googleAdsReadDailyUserLimit: 'ADS_GOOGLE_READ_DAILY_USER_LIMIT',
  googleAdsReadDailyGlobalLimit: 'ADS_GOOGLE_READ_DAILY_GLOBAL_LIMIT',
  googleAdsPublishEnabled: 'GOOGLE_ADS_PUBLISH_ENABLED',
  googleAdsPublishAllowedUserIds: 'GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS',
  googleAdsValidateOnlyTestEnabled: 'GOOGLE_ADS_VALIDATE_ONLY_TEST_ENABLED',
  metaAppId: 'META_APP_ID',
  metaAppSecret: 'META_APP_SECRET',
  metaOAuthRedirectUri: 'META_OAUTH_REDIRECT_URI',
  /** Facebook Login for Business configuration ID. Defined => config_id mode; empty => scope mode. */
  metaLoginConfigId: 'META_LOGIN_CONFIG_ID',
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

export type GoogleAdsAccessMode = 'open' | 'allowlist' | 'off'
export type GoogleAdsAccessIdentity = { emailConfirmed: boolean; isAdmin: boolean }
export type GoogleAdsAccessDecision = {
  mode: GoogleAdsAccessMode
  canConnect: boolean
  canPublish: boolean
  isAdmin: boolean
}

export function resolveGoogleAdsAccessMode(env: Env = process.env): GoogleAdsAccessMode {
  const raw = env[ADS_ENV.googleAdsAccessMode]?.trim().toLowerCase()
  if (!raw) return 'allowlist'
  return raw === 'open' || raw === 'allowlist' || raw === 'off' ? raw : 'off'
}

function isAllowedUser(userId: string | null, raw: string | undefined): boolean {
  if (!userId) return false
  const normalizedUserId = userId.trim().toLowerCase()
  if (!UUID_PATTERN.test(normalizedUserId)) return false
  return (raw ?? '').split(',').some((value) => value.trim().toLowerCase() === normalizedUserId)
}

function resolveLegacyGoogleAdsConnectAccess(userId: string | null, env: Env): boolean {
  if (!userId || env[ADS_ENV.googleAdsConnectEnabled]?.trim() !== '1') return false
  const normalizedUserId = userId.trim().toLowerCase()
  if (!UUID_PATTERN.test(normalizedUserId)) return false
  if (env[ADS_ENV.googleAdsConnectPublic]?.trim() === '1') return true
  return isAllowedUser(normalizedUserId, env[ADS_ENV.googleAdsConnectAllowedUserIds])
}

export function resolveGoogleAdsAccess(
  userId: string | null,
  identity: GoogleAdsAccessIdentity,
  env: Env = process.env,
): GoogleAdsAccessDecision {
  const mode = resolveGoogleAdsAccessMode(env)
  const normalizedUserId = userId?.trim().toLowerCase() ?? ''
  const validUser = UUID_PATTERN.test(normalizedUserId)
  const isAdmin = validUser && identity.isAdmin
  const canConnect = validUser && (
    isAdmin || (identity.emailConfirmed && mode === 'open') ||
    (identity.emailConfirmed && mode === 'allowlist' && resolveLegacyGoogleAdsConnectAccess(normalizedUserId, env))
  )
  const canPublish = canConnect && env[ADS_ENV.googleAdsPublishEnabled]?.trim() === '1' && (
    isAdmin ||
    (identity.emailConfirmed && mode === 'open') ||
    (identity.emailConfirmed && mode === 'allowlist' && isAllowedUser(normalizedUserId, env[ADS_ENV.googleAdsPublishAllowedUserIds]))
  )
  return { mode, canConnect, canPublish, isAdmin }
}

export function resolveGoogleAdsConnectAccess(
  userId: string | null,
  env: Env = process.env,
  identity: GoogleAdsAccessIdentity = { emailConfirmed: false, isAdmin: false },
): boolean {
  return resolveGoogleAdsAccess(userId, identity, env).canConnect
}

const GOOGLE_ADS_EXPLORER_DAILY_QUOTA_MAX = 2_879
const GOOGLE_ADS_CONNECT_MAX_ACTIVE_DEFAULT = 3
const GOOGLE_ADS_READ_DAILY_USER_DEFAULT = 400
const GOOGLE_ADS_READ_DAILY_GLOBAL_DEFAULT = 1_500

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

export function resolveGoogleAdsPublishAccess(
  userId: string | null,
  env: Env = process.env,
  identity: GoogleAdsAccessIdentity = { emailConfirmed: false, isAdmin: false },
): boolean {
  return resolveGoogleAdsAccess(userId, identity, env).canPublish
}

export function resolveGoogleAdsKillSwitch(env: Env = process.env): boolean {
  return env[ADS_ENV.googleAdsKillSwitch]?.trim() === '1'
}

const POSTGRES_INTEGER_MAX = 2_147_483_647

function resolveOptionalPublishAttemptLimit(raw: string | undefined, fallback: number | null): number | null {
  const value = raw?.trim()
  if (!value) return fallback
  if (!/^\d{1,10}$/.test(value)) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= POSTGRES_INTEGER_MAX ? parsed : fallback
}

export type GoogleAdsPublishLimits = {
  dailyAttemptsPerUser: number
  dailyAttemptsGlobal: number | null
}

export function resolveGoogleAdsPublishLimits(env: Env = process.env): GoogleAdsPublishLimits {
  return {
    dailyAttemptsPerUser: resolveOptionalPublishAttemptLimit(
      env[ADS_ENV.googleAdsPublishDailyUserLimit], 30,
    ) ?? 30,
    dailyAttemptsGlobal: resolveOptionalPublishAttemptLimit(
      env[ADS_ENV.googleAdsPublishDailyGlobalLimit], null,
    ),
  }
}

/** Separate, fail-closed gate for the admin-only Google Ads validate_only test route. */
export function resolveGoogleAdsValidateOnlyTestEnabled(env: Env = process.env): boolean {
  return env[ADS_ENV.googleAdsValidateOnlyTestEnabled]?.trim() === '1'
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

export type MetaAdsOAuthSettings = {
  appId: string
  appSecret: string
  stateSecret: string
  redirectUri: string
  /** null => classic scope mode; set => Facebook Login for Business config_id mode. */
  loginConfigId: string | null
}

export type MetaAdsOAuthSettingsResult =
  | { ok: true; settings: MetaAdsOAuthSettings }
  | { ok: false; reason: 'configuration_missing' | 'redirect_uri_invalid' | 'login_config_invalid' }

const DEFAULT_META_ADS_REDIRECT_URI = 'https://gloval.ai/api/ads/meta/callback'
const META_ADS_CALLBACK_PATH = '/api/ads/meta/callback'
const META_LOGIN_CONFIG_ID_PATTERN = /^\d{5,32}$/

export function resolveMetaAdsOAuthSettings(env: Env = process.env): MetaAdsOAuthSettingsResult {
  const appId = env[ADS_ENV.metaAppId]?.trim()
  const appSecret = env[ADS_ENV.metaAppSecret]?.trim()
  const stateSecret = env[ADS_ENV.googleAdsOAuthStateSecret]
  if (!appId || !appSecret || !stateSecret || stateSecret.length < 32) {
    return { ok: false, reason: 'configuration_missing' }
  }

  // A defined-but-malformed config id must not silently fall back to scope mode.
  const rawConfigId = env[ADS_ENV.metaLoginConfigId]?.trim()
  if (rawConfigId && !META_LOGIN_CONFIG_ID_PATTERN.test(rawConfigId)) {
    return { ok: false, reason: 'login_config_invalid' }
  }

  const redirectUri = env[ADS_ENV.metaOAuthRedirectUri]?.trim() || DEFAULT_META_ADS_REDIRECT_URI
  try {
    const parsed = new URL(redirectUri)
    const localHttp = process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:' && parsed.hostname === 'localhost'
    if (
      (!localHttp && parsed.protocol !== 'https:') ||
      parsed.pathname !== META_ADS_CALLBACK_PATH ||
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
    settings: { appId, appSecret, stateSecret, redirectUri, loginConfigId: rawConfigId || null },
  }
}
