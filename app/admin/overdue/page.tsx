import { listOverdue } from '@/lib/admin/overdue-queries'
import { OverdueView } from '@/components/admin/overdue-view'
import type { OverdueReason } from '@/lib/admin/overdue-logic'

export const dynamic = 'force-dynamic'

const REASONS: OverdueReason[] = ['past_due', 'payment_failed_suspended', 'period_expired']

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

export default async function AdminOverduePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const reasonParam = first(params.reason)
  const reason = REASONS.find((r) => r === reasonParam) ?? 'all'
  const query = {
    reason: reason as string,
    plan: first(params.plan),
    noContact: first(params.noContact) === '1',
    q: first(params.q),
  }
  const list = await listOverdue({ ...query, reason, page: Number(first(params.page)) || 1 })
  return <OverdueView list={list} query={query} />
}
