'use client'

import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { PlanCard } from '@/components/pricing/plan-card'
import {
  PLANS,
  type BillingCycle,
  type PlanCode,
} from '@/lib/pricing-config'

const SIDE_BY_SIDE_QUERY = '(min-width: 768px)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(SIDE_BY_SIDE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function useSideBySide() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(SIDE_BY_SIDE_QUERY).matches,
    () => false,
  )
}

/**
 * The plan cards plus the state of their "show all features" toggles.
 *
 * Side by side (md and up) the toggle opens and closes every card together, so
 * the row keeps one height and the cards stay comparable. In a single column
 * each card opens on its own: opening one card must not push the page around
 * under the reader's finger.
 */
export function PlanGrid({
  cycle,
  currentPlanCode,
  renderCta,
  className = '',
}: {
  cycle: BillingCycle
  currentPlanCode?: PlanCode
  renderCta?: (ctx: { code: PlanCode; isCurrent: boolean }) => ReactNode
  className?: string
}) {
  const sideBySide = useSideBySide()
  const [open, setOpen] = useState<Record<PlanCode, boolean>>({
    free: false,
    starter: false,
    pro: false,
    ecommerce: false,
  })

  const setExpanded = (code: PlanCode, next: boolean) => {
    setOpen((current) =>
      sideBySide
        ? { free: next, starter: next, pro: next, ecommerce: next }
        : { ...current, [code]: next },
    )
  }

  return (
    <div className={`grid gap-6 md:grid-cols-2 xl:grid-cols-4 ${className}`}>
      {PLANS.map((plan) => (
        <PlanCard
          key={plan.code}
          plan={plan}
          cycle={cycle}
          currentPlanCode={currentPlanCode}
          renderCta={renderCta}
          expanded={open[plan.code]}
          onExpandedChange={(next) => setExpanded(plan.code, next)}
        />
      ))}
    </div>
  )
}
