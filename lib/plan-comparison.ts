import type { ComparisonGroup, ComparisonValue, PlanCode } from '@/lib/pricing-config'

/**
 * Column order of the comparison table, which is also the order of the mobile
 * plan-picker tabs. Names match the table headers.
 */
export const COMPARISON_PLANS: ReadonlyArray<{ code: PlanCode; name: string }> = [
  { code: 'free', name: 'FREE' },
  { code: 'starter', name: 'STARTER' },
  { code: 'pro', name: 'PRO' },
  { code: 'ecommerce', name: 'E-TİCARET' },
]

/** The plan that carries the "most popular" highlight. */
export const POPULAR_PLAN: PlanCode = 'pro'

export type PlanColumnGroup = {
  category: string
  rows: Array<{ label: string; value: ComparisonValue }>
}

/** Projects the 4-column comparison down to the single column of one plan. */
export function selectPlanColumn(
  groups: ComparisonGroup[],
  code: PlanCode,
): PlanColumnGroup[] {
  return groups.map((group) => ({
    category: group.category,
    rows: group.rows.map((row) => ({ label: row.label, value: row[code] })),
  }))
}

/** The tab that is open first: the visitor's current plan, else the popular one. */
export function defaultComparisonPlan(currentPlanCode?: PlanCode | null): PlanCode {
  return COMPARISON_PLANS.some((plan) => plan.code === currentPlanCode)
    ? (currentPlanCode as PlanCode)
    : POPULAR_PLAN
}

/**
 * WAI-ARIA tabs keyboard model: arrows wrap around, Home/End jump to the ends.
 * Returns null for keys the tablist does not handle.
 */
export function nextTabIndex(
  key: string,
  current: number,
  count: number,
  rtl = false,
): number | null {
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
  const backward = rtl ? 'ArrowRight' : 'ArrowLeft'
  if (key === forward) return (current + 1) % count
  if (key === backward) return (current - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}
