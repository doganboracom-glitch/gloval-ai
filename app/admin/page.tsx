import { getOverview } from '@/lib/admin/queries'
import { DashboardView } from '@/components/admin/dashboard-view'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const overview = await getOverview()
  return <DashboardView overview={overview} />
}
