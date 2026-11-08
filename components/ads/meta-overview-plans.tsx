'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { RefreshCw } from 'lucide-react'
import { MetaPlanStatusChip } from '@/components/ads/meta-plan-status'
import { Button } from '@/components/ui/button'
import { describeMetaManageError } from '@/lib/ads/meta-manage-ux'
import {
  META_OVERVIEW_REFRESH_COOLDOWN_MS,
  canRefreshMetaPlan,
  formatSyncedAgo,
  formatTodaySpend,
  requestMetaPlanSync,
  type MetaSyncPlanView,
} from '@/lib/ads/meta-overview-refresh'
import type { MetaPlanLang } from '@/lib/ads/meta-plan-status'

type OverviewPlan = MetaSyncPlanView
type PlansResponse = { ok: boolean; plans?: (OverviewPlan & { status: string })[] }

async function fetchPlans(url: string): Promise<PlansResponse> {
  try {
    return (await fetch(url).then((response) => response.json())) as PlansResponse
  } catch {
    return { ok: false }
  }
}

const MAX_VISIBLE = 4

/**
 * Plan summaries on the Overview: same status mapping and chip as the plan picker. Shares the SWR key with the Plans tab.
 * Published plans get a "Durumu yenile" button that calls the same `/api/ads/meta/plans/sync` request as the plan detail card;
 * only one row refreshes at a time and a short cooldown follows, so the server's rate limit and per-plan freshness window stay in charge.
 */
export function MetaOverviewPlans({
  connectionId,
  enabled,
  lang,
  onOpenPlans,
  onOpenSettings,
}: {
  connectionId: string
  enabled: boolean
  lang: MetaPlanLang
  onOpenPlans: () => void
  onOpenSettings?: () => void
}) {
  const { data, mutate } = useSWR(enabled ? `/api/ads/meta/plans?connectionId=${connectionId}` : null, fetchPlans)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [coolingDown, setCoolingDown] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [reauthPlanIds, setReauthPlanIds] = useState<Record<string, boolean>>({})
  const lockRef = useRef(false)
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current)
    },
    [],
  )

  const isTr = lang === 'tr'

  const refreshPlan = useCallback(
    async (planId: string) => {
      if (lockRef.current) return
      lockRef.current = true
      setRefreshingId(planId)
      setErrors((current) => {
        const { [planId]: _removed, ...rest } = current
        return rest
      })
      const result = await requestMetaPlanSync(planId)
      if (result.ok && result.plan) {
        const fresh = result.plan
        await mutate(
          (current) =>
            current?.plans
              ? { ...current, plans: current.plans.map((plan) => (plan.id === planId ? { ...plan, ...fresh, live: result.live ?? fresh.live ?? plan.live } : plan)) }
              : current,
          { revalidate: false },
        )
      } else {
        const text = isTr
          ? describeMetaManageError({ error: result.error, message: result.message })
          : 'Could not refresh the status. Try again shortly.'
        setErrors((current) => ({ ...current, [planId]: text }))
        setReauthPlanIds((current) => ({
          ...current,
          [planId]: result.error === 'reauth_required' || result.error === 'token_expired',
        }))
      }
      setRefreshingId(null)
      setCoolingDown(true)
      cooldownTimer.current = setTimeout(() => {
        lockRef.current = false
        setCoolingDown(false)
      }, META_OVERVIEW_REFRESH_COOLDOWN_MS)
    },
    [isTr, mutate],
  )

  const plans = data?.plans ?? []
  const activePlans = plans.filter((plan) => plan.status !== 'archived')
  const archivedCount = plans.length - activePlans.length
  if (!enabled || (activePlans.length === 0 && archivedCount === 0)) return null

  const visible = activePlans.slice(0, MAX_VISIBLE)
  const hidden = activePlans.length - visible.length
  const now = Date.now()

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">{isTr ? 'Planlar' : 'Plans'}</p>
      {visible.length > 0 ? (
        <ul className="flex flex-col gap-3" aria-label={isTr ? 'Plan özetleri' : 'Plan summaries'}>
          {visible.map((plan) => {
            const name = plan.content.name || (isTr ? 'Adsız' : 'Untitled')
            const refreshable = canRefreshMetaPlan(plan)
            const refreshing = refreshingId === plan.id
            const syncedAgo = refreshable ? formatSyncedAgo(plan.lastSyncedAt, now, lang) : null
            const spendText = refreshable ? formatTodaySpend(plan.live, plan.currency, lang) : null
            const meta = [
              syncedAgo ? (isTr ? `Son eşitleme: ${syncedAgo}` : `Last synced: ${syncedAgo}`) : null,
              spendText,
            ].filter(Boolean)
            const error = errors[plan.id]
            return (
              <li key={plan.id} className="flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 max-w-full truncate text-sm">{name}</span>
                  <MetaPlanStatusChip plan={{ status: plan.status, effectiveStatus: plan.effectiveStatus }} lang={lang} />
                </div>
                {refreshable ? (
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0 text-xs text-muted-foreground">{meta.join(' · ')}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2.5 text-xs"
                      onClick={() => void refreshPlan(plan.id)}
                      disabled={refreshingId !== null || coolingDown}
                      aria-label={isTr ? `${name} durumunu yenile` : `Refresh status of ${name}`}
                      aria-busy={refreshing}
                    >
                      <RefreshCw aria-hidden="true" className={refreshing ? 'size-3.5 motion-safe:animate-spin' : 'size-3.5'} />
                      {refreshing ? (isTr ? 'Yenileniyor…' : 'Refreshing…') : isTr ? 'Durumu yenile' : 'Refresh status'}
                    </Button>
                  </div>
                ) : null}
                {error ? (
                  <p role="alert" className="text-xs text-destructive">
                    {error}
                    {reauthPlanIds[plan.id] && onOpenSettings ? (
                      <>
                        {' '}
                        <button type="button" onClick={onOpenSettings} className="rounded-sm underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {isTr ? 'Ayarlar\'a git' : 'Go to Settings'}
                        </button>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {isTr ? `${archivedCount} arşivlenmiş plan gizli.` : `${archivedCount} archived plan(s) hidden.`}
        </p>
      )}
      <button
        type="button"
        onClick={onOpenPlans}
        className="self-start rounded-sm text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {hidden > 0
          ? isTr ? `+${hidden} plan daha · Planlar sekmesi` : `+${hidden} more · Plans tab`
          : isTr ? 'Planlar sekmesine git' : 'Go to Plans tab'}
      </button>
    </div>
  )
}
