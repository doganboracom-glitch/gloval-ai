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
