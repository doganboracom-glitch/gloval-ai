import { adminMailStats, adminListLogs } from '@/lib/mail'
import { MailOverview } from '@/components/admin/mail-overview'
import { MailHealthCard } from '@/components/admin/mail-health-card'

export const dynamic = 'force-dynamic'

export default async function AdminMailOverviewPage() {
  const [stats, logs] = await Promise.all([adminMailStats(), adminListLogs()])
  return (
    <div className="flex flex-col gap-6">
      <MailHealthCard />
      <MailOverview stats={stats} recent={logs.slice(0, 8)} />
    </div>
  )
}
