import { getOverview } from '@/lib/admin/queries'
import { getHeardFromSummary } from '@/lib/admin/heard-from-summary'
import { DashboardView } from '@/components/admin/dashboard-view'
import { HeardFromSummaryCard } from '@/components/admin/heard-from-summary-card'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const [overview, heardFrom] = await Promise.all([getOverview(), getHeardFromSummary()])
  return (
    <div className="flex flex-col gap-8">
      <DashboardView overview={overview} />
      {heardFrom ? <HeardFromSummaryCard summary={heardFrom} /> : null}
    </div>
  )
}
