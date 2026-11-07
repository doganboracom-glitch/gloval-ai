'use client'

import useSWR from 'swr'
import { MetaPlanStatusChip } from '@/components/ads/meta-plan-status'
import type { MetaPlanLang } from '@/lib/ads/meta-plan-status'

type OverviewPlan = { id: string; status: string; effectiveStatus: string | null; content: { name: string } }

async function fetchPlans(url: string): Promise<{ ok: boolean; plans?: OverviewPlan[] }> {
  try {
    return (await fetch(url).then((response) => response.json())) as { ok: boolean; plans?: OverviewPlan[] }
  } catch {
    return { ok: false }
  }
}

const MAX_VISIBLE = 4

/** Plan summaries on the Overview: same status mapping and chip as the plan picker. Shares the SWR key with the Plans tab. */
export function MetaOverviewPlans({
  connectionId,
  enabled,
  lang,
  onOpenPlans,
}: {
  connectionId: string
  enabled: boolean
  lang: MetaPlanLang
  onOpenPlans: () => void
}) {
  const { data } = useSWR(enabled ? `/api/ads/meta/plans?connectionId=${connectionId}` : null, fetchPlans)
  const plans = data?.plans ?? []
  if (!enabled || plans.length === 0) return null

  const isTr = lang === 'tr'
  const visible = plans.slice(0, MAX_VISIBLE)
  const hidden = plans.length - visible.length

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">{isTr ? 'Planlar' : 'Plans'}</p>
      <ul className="flex flex-col gap-2" aria-label={isTr ? 'Plan özetleri' : 'Plan summaries'}>
        {visible.map((plan) => (
          <li key={plan.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="min-w-0 max-w-full truncate text-sm">{plan.content.name || (isTr ? 'Adsız' : 'Untitled')}</span>
            <MetaPlanStatusChip plan={{ status: plan.status, effectiveStatus: plan.effectiveStatus }} lang={lang} />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onOpenPlans}
        className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {hidden > 0
          ? isTr ? `+${hidden} plan daha · Planlar sekmesi` : `+${hidden} more · Plans tab`
          : isTr ? 'Planlar sekmesine git' : 'Go to Plans tab'}
      </button>
    </div>
  )
}
