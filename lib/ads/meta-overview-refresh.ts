import type { MetaLiveState } from '@/lib/ads/meta-manage'
import { formatMetaMoney } from '@/lib/ads/meta-manage-ux'

/** Plan statuses whose Meta objects exist and that `/api/ads/meta/plans/sync` is able to read back. */
const SYNCABLE_STATUSES = new Set(['published', 'active', 'user_paused'])

/** Cooldown after a refresh finishes; stops rapid clicks from multiplying Graph reads. */
export const META_OVERVIEW_REFRESH_COOLDOWN_MS = 3_000

export type MetaSyncPlanView = {
  id: string
  status: string
  currency?: string | null
  effectiveStatus: string | null
  lastSyncedAt?: string | null
  live?: Partial<MetaLiveState> | null
  objects?: { campaignId: string | null; adSetId: string | null; adId: string | null } | null
  content: { name: string }
}

export type MetaSyncResponse = {
  ok: boolean
  error?: string
  message?: string | null
  plan?: MetaSyncPlanView | null
  live?: Partial<MetaLiveState> | null
}

/** The one client call that reads a plan's live state from Meta; shared by the plan detail card and the Overview rows. */
export async function requestMetaPlanSync(planId: string): Promise<MetaSyncResponse> {
  try {
    const response = await fetch('/api/ads/meta/plans/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId }),
    })
    return (await response.json()) as MetaSyncResponse
  } catch {
    return { ok: false, error: 'network_error' }
  }
}

/** Only plans that already have their campaign, ad set and ad on Meta can be refreshed; drafts and validated plans cannot. */
export function canRefreshMetaPlan(plan: Pick<MetaSyncPlanView, 'status' | 'objects'>): boolean {
  const objects = plan.objects
  return SYNCABLE_STATUSES.has(plan.status) && Boolean(objects?.campaignId && objects.adSetId && objects.adId)
}

/** "az önce" / "2 dk önce" / "3 sa önce" / "2 gün önce"; null when the time is missing or unreadable. */
export function formatSyncedAgo(iso: string | null | undefined, now: number, lang: 'tr' | 'en'): string | null {
  if (!iso) return null
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return null
  const minutes = Math.max(0, Math.floor((now - time) / 60_000))
  const tr = lang === 'tr'
  if (minutes < 1) return tr ? 'az önce' : 'just now'
  if (minutes < 60) return tr ? `${minutes} dk önce` : `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return tr ? `${hours} sa önce` : `${hours} h ago`
  const days = Math.floor(hours / 24)
  return tr ? `${days} gün önce` : `${days} d ago`
}

/** "Bugünkü harcama 12,5 TRY · 340 gösterim" from the stored live snapshot; null when the snapshot has no figures. */
export function formatTodaySpend(
  live: MetaSyncPlanView['live'],
  currency: string | null | undefined,
  lang: 'tr' | 'en',
): string | null {
  const spend = live?.spend
  if (!spend) return null
  const parts: string[] = []
  if (spend.todayMajor != null) {
    parts.push(`${lang === 'tr' ? 'Bugün' : 'Today'}: ${formatMetaMoney(Math.round(spend.todayMajor * 100), currency ?? null)}`)
  }
  if (spend.impressionsToday != null) {
    parts.push(`${spend.impressionsToday.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')} ${lang === 'tr' ? 'gösterim' : 'impressions'}`)
  }
  return parts.length ? parts.join(' · ') : null
}
