'use client'

import useSWR from 'swr'
import { toPlanCode, type PlanCode } from '@/lib/pricing-config'

async function fetchPlan(url: string): Promise<PlanCode> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('plan_fetch_failed')
  const json = (await res.json()) as { planCode?: string }
  return toPlanCode(json.planCode)
}

/** Current visitor's plan, or `null` while it is still loading (or failed). */
export function usePlanCode(): PlanCode | null {
  const { data } = useSWR('/api/billing/plan', fetchPlan, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  return data ?? null
}
