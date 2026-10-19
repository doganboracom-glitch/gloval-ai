'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { ComparisonCell } from '@/components/pricing/comparison-cell'
import type { ComparisonCopy } from '@/lib/plan-copy'
import {
  COMPARISON_PLANS,
  POPULAR_PLAN,
  defaultComparisonPlan,
  nextTabIndex,
  selectPlanColumn,
} from '@/lib/plan-comparison'
import type { ComparisonGroup, PlanCode } from '@/lib/pricing-config'

/**
 * Narrow-screen replacement for the 4-column comparison table: one tab per
 * plan, and below it a two-column list (feature | value of the selected plan).
 * Four plan columns do not fit a phone, and a table that overflows widens the
 * whole page, so there is no horizontal scrolling at all in this layout.
 */
export function ComparisonPlanPicker({
  comparison,
  copy,
  currentPlanCode,
  rtl = false,
  className = '',
}: {
  comparison: ComparisonGroup[]
  copy: ComparisonCopy
  currentPlanCode?: PlanCode | null
  rtl?: boolean
  className?: string
}) {
  const [selected, setSelected] = useState<PlanCode>(() =>
    defaultComparisonPlan(currentPlanCode),
  )
  const baseId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const selectedIndex = COMPARISON_PLANS.findIndex((plan) => plan.code === selected)
  const selectedPlan = COMPARISON_PLANS[selectedIndex]
  const groups = selectPlanColumn(comparison, selected)
  const tabId = (code: PlanCode) => `${baseId}-tab-${code}`
  const panelId = `${baseId}-panel`

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextTabIndex(event.key, index, COMPARISON_PLANS.length, rtl)
    if (next === null) return
    event.preventDefault()
    setSelected(COMPARISON_PLANS[next].code)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className={`min-w-0 ${className}`}>
      <div
        role="tablist"
        aria-label={copy.planPicker}
        className="grid grid-cols-4 gap-1 border-b border-border bg-secondary/30 p-2"
      >
        {COMPARISON_PLANS.map((plan, index) => {
          const active = plan.code === selected
          return (
            <button
              key={plan.code}
              ref={(node) => {
                tabRefs.current[index] = node
              }}
              id={tabId(plan.code)}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => setSelected(plan.code)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 font-display text-[10px] font-bold tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[390px]:text-[11px] ${
                active
                  ? 'bg-brand text-brand-foreground shadow-sm'
                  : plan.code === POPULAR_PLAN
                    ? 'text-brand hover:bg-secondary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <span className="max-w-full truncate">{plan.name}</span>
              {plan.code === POPULAR_PLAN && (
                <span
                  aria-hidden
                  className={`h-1 w-4 rounded-full ${active ? 'bg-brand-foreground/70' : 'bg-brand'}`}
                />
              )}
              {plan.code === POPULAR_PLAN && <span className="sr-only">{copy.popular}</span>}
            </button>
          )
        })}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(selected)}
        className="min-w-0"
      >
        <table className="w-full table-fixed border-separate border-spacing-0 text-left">
          <caption className="sr-only">{selectedPlan.name}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="w-1/2 px-4 py-3 text-xs font-medium text-muted-foreground"
              >
                {copy.featureColumn}
              </th>
              <th scope="col" className="px-3 py-3 text-center">
                <span className="font-display text-[11px] font-bold tracking-widest text-brand">
                  {selectedPlan.name}
                </span>
                {selected === POPULAR_PLAN && (
                  <span className="mt-0.5 block text-[11px] font-medium normal-case tracking-normal text-muted-foreground">
                    {copy.popular}
                  </span>
                )}
              </th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.category}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={2}
                  className="border-t border-border bg-secondary/40 px-4 py-2 font-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  {group.category}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={`${group.category}-${row.label}`} className="min-h-12">
                  <th
                    scope="row"
                    className="h-12 border-t border-border/60 py-2 pl-4 pr-3 align-middle text-sm font-normal leading-snug text-muted-foreground [overflow-wrap:anywhere]"
                  >
                    {row.label}
                  </th>
                  <td className="h-12 border-t border-border/60 bg-brand/5 px-3 py-2 text-center align-middle font-medium leading-snug [overflow-wrap:anywhere]">
                    <ComparisonCell value={row.value} copy={copy} textClassName="text-sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  )
}
