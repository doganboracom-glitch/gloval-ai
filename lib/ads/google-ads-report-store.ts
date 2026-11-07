import 'server-only'

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const GOOGLE_ADS_REPORT_CACHE_TTL_MS = 30 * 60 * 1000
export const GOOGLE_ADS_REPORT_REFRESH_COOLDOWN_MS = 2 * 60 * 60 * 1000
export const GOOGLE_ADS_REPORT_ANALYSIS_TTL_MS = 24 * 60 * 60 * 1000
export const GOOGLE_ADS_REPORT_DAILY_ANALYSIS_LIMIT = 3

export type GoogleAdsReportFrequency = 'weekly' | 'monthly'

export type GoogleAdsReportPreferences = {
  userId: string
  connectionId: string
  weeklyEnabled: boolean
  monthlyEnabled: boolean
  lastWeeklyPeriodEnd: string | null
  lastMonthlyPeriodEnd: string | null
}

export type GoogleAdsReportCache<T> = {
  payload: T
  refreshedAt: string
  expiresAt: string
}

export class GoogleAdsReportStorageError extends Error {
  constructor() {
    super('google_ads_report_storage_unavailable')
    this.name = 'GoogleAdsReportStorageError'
  }
}

const localCache = new Map<string, GoogleAdsReportCache<unknown>>()
const localLatestRefresh = new Map<string, string>()
const LOCAL_CACHE_MAX_ENTRIES = 500

type CacheKeyInput = { userId: string; connectionId: string; key: string }

function localKey(input: CacheKeyInput): string {
  return `${input.userId}:${input.connectionId}:${input.key}`
}

function localConnectionKey(userId: string, connectionId: string): string {
  return `${userId}:${connectionId}`
}

function keepLocalCache(key: string, value: GoogleAdsReportCache<unknown>): void {
  if (localCache.size >= LOCAL_CACHE_MAX_ENTRIES && !localCache.has(key)) {
    const oldestKey = localCache.keys().next().value
    if (oldestKey) localCache.delete(oldestKey)
  }
  localCache.set(key, value)
}

export function createGoogleAdsReportCacheKey(prefix: 'report' | 'analysis', value: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify(value)).digest('hex')
  return `${prefix}:${digest}`
}

export async function getGoogleAdsReportCache<T>(input: CacheKeyInput, includeExpired = false): Promise<GoogleAdsReportCache<T> | null> {
  const key = localKey(input)
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('ads_google_insights_cache')
      .select('payload,refreshed_at,expires_at')
      .eq('user_id', input.userId)
      .eq('connection_id', input.connectionId)
      .eq('cache_key', input.key)
      .maybeSingle()

    if (!error && data && typeof data.refreshed_at === 'string' && typeof data.expires_at === 'string') {
      const cached = {
        payload: data.payload as T,
        refreshedAt: data.refreshed_at,
        expiresAt: data.expires_at,
      }
      if (Date.parse(cached.expiresAt) > Date.now() || includeExpired) {
        keepLocalCache(key, cached)
        return cached
      }
    }
  } catch {
    // The local cache is a best-effort fallback when the unapplied cache migration is unavailable.
  }

  const fallback = localCache.get(key)
  if (!fallback || (!includeExpired && Date.parse(fallback.expiresAt) <= Date.now())) return null
  return fallback as GoogleAdsReportCache<T>
}

export async function getLatestGoogleAdsReportRefresh(userId: string, connectionId: string): Promise<string | null> {
  const fallback = localLatestRefresh.get(localConnectionKey(userId, connectionId)) ?? null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('ads_google_insights_cache')
      .select('refreshed_at')
      .eq('user_id', userId)
      .eq('connection_id', connectionId)
      .like('cache_key', 'report:%')
      .order('refreshed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!error && typeof data?.refreshed_at === 'string') {
      localLatestRefresh.set(localConnectionKey(userId, connectionId), data.refreshed_at)
      return data.refreshed_at
    }
  } catch {
    // The process-local timestamp is only a best-effort fallback until the cache table exists.
  }
  return fallback
}

export async function setGoogleAdsReportCache<T>(input: CacheKeyInput & {
  payload: T
  ttlMs: number
  now?: Date
}): Promise<GoogleAdsReportCache<T>> {
  const now = input.now ?? new Date()
  const cache = {
    payload: input.payload,
    refreshedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttlMs).toISOString(),
  }
  keepLocalCache(localKey(input), cache)
  if (input.key.startsWith('report:')) {
    localLatestRefresh.set(localConnectionKey(input.userId, input.connectionId), cache.refreshedAt)
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('ads_google_insights_cache')
      .upsert({
        user_id: input.userId,
        connection_id: input.connectionId,
        cache_key: input.key,
        payload: input.payload,
        refreshed_at: cache.refreshedAt,
        expires_at: cache.expiresAt,
      }, { onConflict: 'user_id,connection_id,cache_key' })
    if (error) return cache
  } catch {
    // Database caching becomes available when scripts/121-google-ads-performance-reporting.sql is applied.
  }
  return cache
}

export async function deleteGoogleAdsReportCache(input: CacheKeyInput): Promise<void> {
  localCache.delete(localKey(input))
  try {
    const admin = createAdminClient()
    await admin
      .from('ads_google_insights_cache')
      .delete()
      .eq('user_id', input.userId)
      .eq('connection_id', input.connectionId)
      .eq('cache_key', input.key)
  } catch {
    // Best-effort: the entry expires on its own when the database cache is unavailable.
  }
}

export async function getGoogleAdsReportPreferences(userId: string): Promise<GoogleAdsReportPreferences | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ads_google_report_preferences')
    .select('user_id,connection_id,weekly_enabled,monthly_enabled,last_weekly_period_end,last_monthly_period_end')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new GoogleAdsReportStorageError()
  if (!data) return null
  return {
    userId: data.user_id,
    connectionId: data.connection_id,
    weeklyEnabled: data.weekly_enabled === true,
    monthlyEnabled: data.monthly_enabled === true,
    lastWeeklyPeriodEnd: data.last_weekly_period_end,
    lastMonthlyPeriodEnd: data.last_monthly_period_end,
  }
}

export async function saveGoogleAdsReportPreferences(input: {
  userId: string
  connectionId: string
  weeklyEnabled: boolean
  monthlyEnabled: boolean
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('ads_google_report_preferences')
    .upsert({
      user_id: input.userId,
      connection_id: input.connectionId,
      weekly_enabled: input.weeklyEnabled,
      monthly_enabled: input.monthlyEnabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  if (error) throw new GoogleAdsReportStorageError()
}

export async function listDueGoogleAdsReportPreferences(
  frequency: GoogleAdsReportFrequency,
  periodEnd: string,
): Promise<GoogleAdsReportPreferences[]> {
  const admin = createAdminClient()
  const enabledColumn = frequency === 'weekly' ? 'weekly_enabled' : 'monthly_enabled'
  const sentColumn = frequency === 'weekly' ? 'last_weekly_period_end' : 'last_monthly_period_end'
  const { data, error } = await admin
    .from('ads_google_report_preferences')
    .select('user_id,connection_id,weekly_enabled,monthly_enabled,last_weekly_period_end,last_monthly_period_end')
    .eq(enabledColumn, true)
    .or(`${sentColumn}.is.null,${sentColumn}.lt.${periodEnd}`)
    .order(sentColumn, { ascending: true, nullsFirst: true })
    .order('user_id', { ascending: true })
    .limit(1000)

  if (error) throw new GoogleAdsReportStorageError()
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    connectionId: row.connection_id,
    weeklyEnabled: row.weekly_enabled === true,
    monthlyEnabled: row.monthly_enabled === true,
    lastWeeklyPeriodEnd: row.last_weekly_period_end,
    lastMonthlyPeriodEnd: row.last_monthly_period_end,
  }))
}

export async function markGoogleAdsReportSent(
  userId: string,
  connectionId: string,
  frequency: GoogleAdsReportFrequency,
  periodEnd: string,
): Promise<void> {
  const admin = createAdminClient()
  const column = frequency === 'weekly' ? 'last_weekly_period_end' : 'last_monthly_period_end'
  const { error } = await admin
    .from('ads_google_report_preferences')
    .update({ [column]: periodEnd })
    .eq('user_id', userId)
    .eq('connection_id', connectionId)
  if (error) throw new GoogleAdsReportStorageError()
}

export async function addGoogleAdsReportUnsubscribeToken(userId: string, tokenHash: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('ads_google_report_unsubscribe_tokens')
    .insert({ user_id: userId, token_hash: tokenHash })
  if (error) throw new GoogleAdsReportStorageError()
}

export async function googleAdsReportUnsubscribeTokenExists(tokenHash: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ads_google_report_unsubscribe_tokens')
    .select('token_hash')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (error) throw new GoogleAdsReportStorageError()
  return Boolean(data)
}

export async function disableGoogleAdsReportsByTokenHash(tokenHash: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: token, error: tokenError } = await admin
    .from('ads_google_report_unsubscribe_tokens')
    .select('user_id')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (tokenError) throw new GoogleAdsReportStorageError()
  if (!token) return false

  const { error: preferenceError } = await admin
    .from('ads_google_report_preferences')
    .update({ weekly_enabled: false, monthly_enabled: false })
    .eq('user_id', token.user_id)
  if (preferenceError) throw new GoogleAdsReportStorageError()

  const { error: deleteError } = await admin
    .from('ads_google_report_unsubscribe_tokens')
    .delete()
    .eq('user_id', token.user_id)
  if (deleteError) throw new GoogleAdsReportStorageError()
  return true
}

export async function isGoogleAdsReportStillEnabled(
  userId: string,
  connectionId: string,
  frequency: GoogleAdsReportFrequency,
): Promise<boolean> {
  const admin = createAdminClient()
  const column = frequency === 'weekly' ? 'weekly_enabled' : 'monthly_enabled'
  const { data, error } = await admin
    .from('ads_google_report_preferences')
    .select(column)
    .eq('user_id', userId)
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (error) throw new GoogleAdsReportStorageError()
  return Boolean(data && (data as Record<string, unknown>)[column] === true)
}

export async function claimGoogleAdsAnalysisSlot(userId: string): Promise<{ allowed: boolean; used: number }> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('ads_claim_google_ads_analysis', { p_user_id: userId })
  if (error) throw new GoogleAdsReportStorageError()

  const result = Array.isArray(data) ? data[0] : data
  if (!result || typeof result !== 'object') throw new GoogleAdsReportStorageError()
  const row = result as { allowed?: unknown; used?: unknown }
  if (typeof row.allowed !== 'boolean' || typeof row.used !== 'number') throw new GoogleAdsReportStorageError()
  return { allowed: row.allowed, used: row.used }
}
