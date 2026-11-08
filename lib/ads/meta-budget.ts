import type { MetaApiContext } from '@/lib/ads/meta-api-client'
import type { MetaGraph } from '@/lib/ads/meta-publish'

const CACHE_TTL_MS = 10 * 60 * 1000
const MAX_CACHE_ENTRIES = 256
const cache = new Map<string, { value: number | null; expiresAt: number }>()

type MinimumBudgetInput = {
  graph: MetaGraph
  accessToken: string
  context: MetaApiContext
  accountId: string
  connectionId: string
  currency: string
  optimizationGoal: 'LANDING_PAGE_VIEWS' | 'LINK_CLICKS'
  now?: number
}

export function metaMinimumBudgetField(optimizationGoal: MinimumBudgetInput['optimizationGoal']): 'min_daily_budget_high_freq' | null {
  // Meta documents high_freq for click goals, but no direct minimum field for landing-page views.
  return optimizationGoal === 'LINK_CLICKS' ? 'min_daily_budget_high_freq' : null
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function parseMetaMinimumDailyBudget(
  value: unknown,
  optimizationGoal: MinimumBudgetInput['optimizationGoal'],
  currency: string,
): number | null {
  const field = metaMinimumBudgetField(optimizationGoal)
  if (!field) return null

  const root = record(value)
  const rows = Array.isArray(root.data) ? root.data : [root.data ?? root]
  const row = rows.map(record).find((candidate) => typeof candidate.currency === 'string' && candidate.currency.toUpperCase() === currency.toUpperCase())
  if (!row) return null
  const raw = row[field]
  const parsed = typeof raw === 'number'
    ? raw
    : typeof raw === 'string' && /^\d{1,15}$/.test(raw)
      ? Number(raw)
      : NaN
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Reads the account minimums exposed by Meta's `minimum_budgets` edge. The documented high-frequency floor is
 * used for link-click optimization; Meta does not expose a directly mapped field for landing-page views, so the
 * validate_only response remains authoritative for that goal and for country-specific targeting rules.
 */
export async function getMetaMinimumDailyBudget(input: MinimumBudgetInput): Promise<number | null> {
  const field = metaMinimumBudgetField(input.optimizationGoal)
  if (!field) return null

  const now = input.now ?? Date.now()
  const key = `${input.connectionId}:${input.accountId}:${input.currency}:${input.optimizationGoal}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) return cached.value

  const response = await input.graph.request({
    endpoint: 'act.minimum_budgets',
    path: `/${input.accountId}/minimum_budgets`,
    accessToken: input.accessToken,
    query: { fields: `currency,${field}` },
    context: input.context,
  })
  const value = parseMetaMinimumDailyBudget(response, input.optimizationGoal, input.currency)
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS })
  if (cache.size > MAX_CACHE_ENTRIES) {
    for (const [entryKey, entry] of cache) {
      if (entry.expiresAt <= now || cache.size > MAX_CACHE_ENTRIES) cache.delete(entryKey)
      if (cache.size <= MAX_CACHE_ENTRIES) break
    }
  }
  return value
}
